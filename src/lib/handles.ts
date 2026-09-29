/**
 * Handle ids on a person card. They are the contract between the card, which
 * renders the handles, and `buildEdges`, which decides which pair to connect.
 *
 * Parents connect bottom-centre to top-centre. Adjacent spouses connect side
 * to side; spouses with somebody between them connect over the top so the line
 * does not run behind the intervening card.
 */
export const HANDLE = {
  parentIn: "parent-in",
  childOut: "child-out",
  spouseRight: "spouse-right",
  spouseLeft: "spouse-left",
  spouseTopOut: "spouse-top-out",
  spouseTopIn: "spouse-top-in",
} as const;
