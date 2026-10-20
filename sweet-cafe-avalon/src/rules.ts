/** 提案投票結果：贊成票必須多於反對票才通過，平票視為失敗。 */
export function isProposalApproved(approve: number, reject: number): boolean {
  return approve > reject;
}
