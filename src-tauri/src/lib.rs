use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, process::Command};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceFingerprint {
    fingerprint: String,
    cpu_hash: String,
    motherboard_hash: String,
    mac_address_hashes: Vec<String>,
    sources: Vec<String>,
}

#[tauri::command]
fn get_device_fingerprint() -> Result<DeviceFingerprint, String> {
    let cpu_values = collect_cpu_identifiers();
    let motherboard_values = collect_motherboard_identifiers();
    let mac_values = collect_mac_addresses();
    let cpu_normalized = normalize_values(&cpu_values);
    let motherboard_normalized = normalize_values(&motherboard_values);
    let mac_normalized = normalize_values(&mac_values);

    if cpu_normalized.is_empty() && motherboard_normalized.is_empty() && mac_normalized.is_empty() {
        return Err("No stable hardware identifiers were found on this device.".into());
    }

    let mut sources = Vec::new();
    if !cpu_normalized.is_empty() {
        sources.push("cpu".to_string());
    }
    if !motherboard_normalized.is_empty() {
        sources.push("motherboard".to_string());
    }
    if !mac_normalized.is_empty() {
        sources.push("mac".to_string());
    }

    let fingerprint_input = format!(
        "family-tree-studio-device-v1|cpu={cpu_normalized}|motherboard={motherboard_normalized}|mac={mac_normalized}"
    );

    Ok(DeviceFingerprint {
        fingerprint: sha256_hex(&fingerprint_input),
        cpu_hash: hash_optional(&cpu_normalized),
        motherboard_hash: hash_optional(&motherboard_normalized),
        mac_address_hashes: mac_values.iter().map(|value| sha256_hex(value)).collect(),
        sources,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_device_fingerprint])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn hash_optional(value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        sha256_hex(value)
    }
}

fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_values(values: &[String]) -> String {
    let mut cleaned = values
        .iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty() && value != "unknown" && value != "none" && value != "not specified")
        .collect::<Vec<_>>();
    cleaned.sort();
    cleaned.dedup();
    cleaned.join("|")
}

fn command_output(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
        .unwrap_or_default()
}

fn non_empty_lines(value: String) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(target_os = "macos")]
fn collect_cpu_identifiers() -> Vec<String> {
    non_empty_lines(command_output("sysctl", &["-n", "machdep.cpu.brand_string"]))
}

#[cfg(target_os = "macos")]
fn collect_motherboard_identifiers() -> Vec<String> {
    let ioreg = command_output("ioreg", &["-rd1", "-c", "IOPlatformExpertDevice"]);
    extract_keyed_values(&ioreg, &["IOPlatformSerialNumber", "IOPlatformUUID", "board-id"])
}

#[cfg(target_os = "macos")]
fn collect_mac_addresses() -> Vec<String> {
    extract_mac_addresses(&command_output("ifconfig", &["-a"]))
}

#[cfg(target_os = "linux")]
fn collect_cpu_identifiers() -> Vec<String> {
    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
    extract_keyed_values(&cpuinfo, &["model name", "Hardware", "Serial", "Processor"])
}

#[cfg(target_os = "linux")]
fn collect_motherboard_identifiers() -> Vec<String> {
    [
        "/sys/class/dmi/id/board_vendor",
        "/sys/class/dmi/id/board_name",
        "/sys/class/dmi/id/board_serial",
        "/sys/class/dmi/id/product_uuid",
    ]
    .iter()
    .filter_map(|path| std::fs::read_to_string(path).ok())
    .flat_map(non_empty_lines)
    .collect()
}

#[cfg(target_os = "linux")]
fn collect_mac_addresses() -> Vec<String> {
    let mut values = extract_mac_addresses(&command_output("ip", &["link"]));
    values.extend(extract_mac_addresses(&command_output("ifconfig", &["-a"])));
    normalize_macs(values)
}

#[cfg(target_os = "windows")]
fn collect_cpu_identifiers() -> Vec<String> {
    extract_keyed_values(&command_output("wmic", &["cpu", "get", "Name,ProcessorId", "/value"]), &["Name", "ProcessorId"])
}

#[cfg(target_os = "windows")]
fn collect_motherboard_identifiers() -> Vec<String> {
    extract_keyed_values(
        &command_output("wmic", &["baseboard", "get", "Manufacturer,Product,SerialNumber", "/value"]),
        &["Manufacturer", "Product", "SerialNumber"],
    )
}

#[cfg(target_os = "windows")]
fn collect_mac_addresses() -> Vec<String> {
    extract_mac_addresses(&command_output("getmac", &["/fo", "csv", "/nh"]))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn collect_cpu_identifiers() -> Vec<String> {
    Vec::new()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn collect_motherboard_identifiers() -> Vec<String> {
    Vec::new()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn collect_mac_addresses() -> Vec<String> {
    Vec::new()
}

fn extract_keyed_values(output: &str, keys: &[&str]) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            keys.iter().find_map(|key| {
                if !trimmed.to_lowercase().contains(&key.to_lowercase()) {
                    return None;
                }
                trimmed
                    .split_once('=')
                    .or_else(|| trimmed.split_once(':'))
                    .map(|(_, value)| value.trim().trim_matches('"').trim_matches('<').trim_matches('>').to_string())
            })
        })
        .filter(|value| !value.trim().is_empty())
        .collect()
}

fn extract_mac_addresses(output: &str) -> Vec<String> {
    let candidates = output
        .split(|character: char| character.is_whitespace() || character == ',' || character == '"')
        .filter_map(normalize_mac)
        .collect::<Vec<_>>();
    normalize_macs(candidates)
}

fn normalize_macs(values: Vec<String>) -> Vec<String> {
    let mut unique = BTreeSet::new();
    for value in values {
        if value != "00:00:00:00:00:00" && value != "ff:ff:ff:ff:ff:ff" {
            unique.insert(value);
        }
    }
    unique.into_iter().collect()
}

fn normalize_mac(token: &str) -> Option<String> {
    let normalized = token.trim().trim_matches(',').replace('-', ":").to_lowercase();
    let parts = normalized.split(':').collect::<Vec<_>>();
    if parts.len() != 6 {
        return None;
    }
    if parts.iter().all(|part| part.len() == 2 && part.chars().all(|character| character.is_ascii_hexdigit())) {
        Some(parts.join(":"))
    } else {
        None
    }
}
