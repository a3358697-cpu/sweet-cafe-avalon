/** 提案投票結果：贊成票必須多於反對票才通過，平票視為失敗。 */
export function isProposalApproved(approve: number, reject: number): boolean {
  return approve > reject;
}

/** 連續提案失敗幾次後，奧客陣營獲勝。 */
export const MAX_CONSECUTIVE_REJECTIONS = 5;

/** 更新連續提案失敗次數：提案通過就歸零，失敗則加 1。 */
export function nextRejectionCount(current: number, approved: boolean): number {
  return approved ? 0 : current + 1;
}

/** 連續提案失敗達 5 次時，奧客陣營獲勝。 */
export function isEvilWinByRejections(count: number): boolean {
  return count >= MAX_CONSECUTIVE_REJECTIONS;
}

/** 任務是否失敗：一般至少 1 張客訴卡；8 人以上的第 4 輪需至少 2 張。 */
export function isMissionFailed(
  complaintCards: number,
  playerCount: number,
  round: number,
): boolean {
  const needed = playerCount >= 8 && round === 4 ? 2 : 1;
  return complaintCards >= needed;
}

/** 累積客訴卡達幾張後，奧客陣營獲勝。 */
export const COMPLAINT_CARDS_TO_WIN = 3;

/** 累積客訴卡達 3 張（含）以上時，奧客陣營獲勝。 */
export function isEvilWinByComplaintCards(totalCards: number): boolean {
  return totalCards >= COMPLAINT_CARDS_TO_WIN;
}

/** 累積客訴卡總張數：每輪出現的卡片都計入，與該輪任務成敗無關。 */
export function addComplaintCards(total: number, cardsThisMission: number): number {
  return total + cardsThisMission;
}

/** 店員成功完成幾次任務後，進入檢舉階段。 */
export const SUCCESSFUL_MISSIONS_TO_REPORT = 3;

/** 店員成功完成 3 次（含）以上任務時，進入檢舉階段。 */
export function shouldEnterReportPhase(successfulMissions: number): boolean {
  return successfulMissions >= SUCCESSFUL_MISSIONS_TO_REPORT;
}

/** 陣營：staff = 店員陣營，evil = 奧客陣營。 */
export type Faction = "staff" | "evil";

/** 檢舉結果：指認到真正的店長，奧客陣營獲勝；指認錯誤，店員陣營獲勝。 */
export function resolveReport(accusedId: string, managerId: string): Faction {
  return accusedId === managerId ? "evil" : "staff";
}

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12;

/** 玩家人數是否有效：整數且介於 6～12 人（含）。 */
export function isValidPlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS;
}

/** 主持模式：HOST_ONLY = 主持人只主持不參與；HOST_IS_PLAYER = 主持人同時也是玩家。 */
export const HOST_MODES = ["HOST_ONLY", "HOST_IS_PLAYER"] as const;
export type HostMode = (typeof HOST_MODES)[number];

/**
 * 遊戲階段：LOBBY 等待玩家加入；PROPOSAL 隊長提出任務人選；VOTING 玩家表決提案；
 * MISSION 執行任務、提交營業或客訴卡；REPORT 完成 3 次成功任務後的檢舉階段；FINISHED 遊戲結束。
 */
export const GAME_PHASES = [
  "LOBBY",
  "PROPOSAL",
  "VOTING",
  "MISSION",
  "REPORT",
  "FINISHED",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

const ALLOWED_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  LOBBY: ["PROPOSAL"],
  PROPOSAL: ["VOTING"],
  VOTING: ["PROPOSAL", "MISSION", "FINISHED"],
  MISSION: ["PROPOSAL", "REPORT", "FINISHED"],
  REPORT: ["FINISHED"],
  FINISHED: [],
};

/** 階段轉換是否允許：只有明列的轉換回傳 true，其餘（含轉換到自己）皆為 false。 */
export function canTransitionPhase(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** 奧客勝利條件是否達成：連續提案失敗達 5 次，或累積客訴卡達 3 張，任一符合即可。 */
export function isEvilVictoryConditionMet(
  consecutiveRejections: number,
  totalComplaintCards: number,
): boolean {
  return (
    isEvilWinByRejections(consecutiveRejections) ||
    isEvilWinByComplaintCards(totalComplaintCards)
  );
}

/**
 * 遊戲結束原因：EVIL_REJECTIONS 連續 5 次提案未通過；EVIL_COMPLAINT_CARDS 累積 3 張客訴卡；
 * EVIL_REPORT_CORRECT 檢舉階段正確指出店長（奧客勝）；STAFF_REPORT_WRONG 檢舉錯誤（店員勝）。
 */
export const GAME_END_REASONS = [
  "EVIL_REJECTIONS",
  "EVIL_COMPLAINT_CARDS",
  "EVIL_REPORT_CORRECT",
  "STAFF_REPORT_WRONG",
] as const;
export type GameEndReason = (typeof GAME_END_REASONS)[number];

/** 獲勝陣營：staff（店員）或 evil（奧客）。 */
export type WinnerFaction = Faction;

/** 遊戲結束結果：獲勝陣營與結束原因。 */
export type GameEndResult = {
  winner: WinnerFaction;
  reason: GameEndReason;
};

/** 每種結束原因對應的獲勝陣營。 */
export const END_REASON_WINNER: Record<GameEndReason, WinnerFaction> = {
  EVIL_REJECTIONS: "evil",
  EVIL_COMPLAINT_CARDS: "evil",
  EVIL_REPORT_CORRECT: "evil",
  STAFF_REPORT_WRONG: "staff",
};

/** 任務結果：是否失敗，以及本次任務新增的客訴卡數（整場累計由遊戲狀態處理）。 */
export type MissionResult = {
  failed: boolean;
  totalComplaintCardsAdded: number;
};

/** 判定單次任務結果；無論成敗，本次提交的客訴卡都照實回傳。 */
export function resolveMission(
  complaintCards: number,
  playerCount: number,
  round: number,
): MissionResult {
  return {
    failed: isMissionFailed(complaintCards, playerCount, round),
    totalComplaintCardsAdded: complaintCards,
  };
}

/** 遊戲狀態（基礎版）：endResult 為 null 表示遊戲尚未結束。 */
export type GameState = {
  phase: GamePhase;
  playerCount: number;
  consecutiveRejections: number;
  totalComplaintCards: number;
  successfulMissions: number;
  endResult: GameEndResult | null;
  currentProposal: Proposal | null;
  currentVoteResult: ProposalVoteResult | null;
  /** 目前任務輪次（從 1 開始）；任務結算後回到 PROPOSAL 才加 1，提案被否決不會增加。 */
  round: number;
};

/** 建立初始遊戲狀態：停在 LOBBY，計數皆為 0，不會自動開始遊戲。 */
export function createInitialGameState(playerCount: number): GameState {
  return {
    phase: "LOBBY",
    playerCount,
    consecutiveRejections: 0,
    totalComplaintCards: 0,
    successfulMissions: 0,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };
}

/** 套用提案投票結果：只更新連續失敗次數，不判定勝負、不切換階段，回傳新物件。 */
export function applyProposalResult(
  state: GameState,
  approved: boolean,
): GameState {
  return {
    ...state,
    consecutiveRejections: nextRejectionCount(
      state.consecutiveRejections,
      approved,
    ),
  };
}

/** 套用任務結果：累加客訴卡（不論成敗），任務成功時成功任務數加 1；不判定勝負、不切換階段。 */
export function applyMissionResult(
  state: GameState,
  missionResult: MissionResult,
): GameState {
  return {
    ...state,
    totalComplaintCards: addComplaintCards(
      state.totalComplaintCards,
      missionResult.totalComplaintCardsAdded,
    ),
    successfulMissions: state.successfulMissions + (missionResult.failed ? 0 : 1),
  };
}

/** 若達成奧客勝利條件，回傳 FINISHED 的新狀態；已結束或未達標則原樣回傳。連續失敗優先。 */
export function applyEvilVictoryIfNeeded(state: GameState): GameState {
  if (state.endResult !== null || state.phase === "FINISHED") return state;

  const reason: GameEndReason | null = isEvilWinByRejections(
    state.consecutiveRejections,
  )
    ? "EVIL_REJECTIONS"
    : isEvilWinByComplaintCards(state.totalComplaintCards)
      ? "EVIL_COMPLAINT_CARDS"
      : null;
  if (reason === null) return state;

  return {
    ...state,
    phase: "FINISHED",
    endResult: { winner: END_REASON_WINNER[reason], reason },
  };
}

/** 套用檢舉結果：僅在 REPORT 階段且尚無結果時生效，設為 FINISHED 並寫入 endResult；否則原樣回傳。 */
export function applyReportResult(
  state: GameState,
  accusedId: string,
  managerId: string,
): GameState {
  if (state.endResult !== null || state.phase !== "REPORT") return state;

  const reason: GameEndReason =
    resolveReport(accusedId, managerId) === "evil"
      ? "EVIL_REPORT_CORRECT"
      : "STAFF_REPORT_WRONG";

  return {
    ...state,
    phase: "FINISHED",
    endResult: { winner: END_REASON_WINNER[reason], reason },
  };
}

/** 成功任務達標時，將 MISSION 階段切換為 REPORT；未達標、不在 MISSION 或已有結果則原樣回傳。 */
export function enterReportPhaseIfReady(state: GameState): GameState {
  if (
    state.phase !== "MISSION" ||
    state.endResult !== null ||
    !shouldEnterReportPhase(state.successfulMissions) ||
    !canTransitionPhase(state.phase, "REPORT")
  ) {
    return state;
  }
  return { ...state, phase: "REPORT" };
}

/** 處理提案投票：通過進入 MISSION；未通過則先檢查奧客獲勝，否則回到 PROPOSAL。僅限 VOTING 且尚無結果。公開票數只供當前提案使用，處理後一律清除。 */
export function resolveProposalVote(
  state: GameState,
  approved: boolean,
): GameState {
  if (state.phase !== "VOTING" || state.endResult !== null) return state;

  const updated = applyProposalResult(state, approved);

  if (approved) {
    return canTransitionPhase(state.phase, "MISSION")
      ? { ...updated, phase: "MISSION", currentVoteResult: null }
      : state;
  }

  const checked = applyEvilVictoryIfNeeded(updated);
  if (checked.endResult !== null) {
    return { ...checked, currentProposal: null, currentVoteResult: null };
  }

  return canTransitionPhase(state.phase, "PROPOSAL")
    ? {
        ...checked,
        phase: "PROPOSAL",
        currentProposal: null,
        currentVoteResult: null,
      }
    : state;
}

/** 處理任務結果：先累計，再依序判斷奧客獲勝、進入檢舉階段，否則回到 PROPOSAL 並進入下一輪（round + 1）。僅限 MISSION 且尚無結果。 */
export function resolveMissionResult(
  state: GameState,
  missionResult: MissionResult,
): GameState {
  if (state.phase !== "MISSION" || state.endResult !== null) return state;

  const updated = applyMissionResult(state, missionResult);

  const evilWon = applyEvilVictoryIfNeeded(updated);
  if (evilWon.endResult !== null) return { ...evilWon, currentProposal: null };

  const reporting = enterReportPhaseIfReady(updated);
  if (reporting.phase === "REPORT") return { ...reporting, currentProposal: null };

  return canTransitionPhase(state.phase, "PROPOSAL")
    ? { ...updated, phase: "PROPOSAL", currentProposal: null, round: state.round + 1 }
    : state;
}

/** 開始遊戲：僅限 LOBBY、尚無結果且人數有效時，將階段改為 PROPOSAL；否則原樣回傳。 */
export function startGame(state: GameState): GameState {
  if (
    state.phase !== "LOBBY" ||
    state.endResult !== null ||
    !isValidPlayerCount(state.playerCount) ||
    !canTransitionPhase(state.phase, "PROPOSAL")
  ) {
    return state;
  }
  return { ...state, phase: "PROPOSAL" };
}

/** 提案：leaderId 為提案者，teamMemberIds 為被提名執行任務的玩家 ID。 */
export type Proposal = {
  leaderId: string;
  teamMemberIds: string[];
};

/** 建立提案：複製隊伍陣列，不驗證隊伍人數（各輪人數尚未確認）。 */
export function createProposal(
  leaderId: string,
  teamMemberIds: readonly string[],
): Proposal {
  return { leaderId, teamMemberIds: [...teamMemberIds] };
}

/** 提交提案：僅限 PROPOSAL、尚無結果時，保存提案複本、清除舊票數並進入 VOTING；否則原樣回傳。 */
export function submitProposal(state: GameState, proposal: Proposal): GameState {
  if (
    state.phase !== "PROPOSAL" ||
    state.endResult !== null ||
    !canTransitionPhase(state.phase, "VOTING")
  ) {
    return state;
  }
  return {
    ...state,
    phase: "VOTING",
    currentProposal: createProposal(proposal.leaderId, proposal.teamMemberIds),
    currentVoteResult: null,
  };
}

/** 提案投票結果：只記錄贊成與反對的總票數，不記錄個別玩家的投票。 */
export type ProposalVoteResult = {
  approveCount: number;
  rejectCount: number;
};

/** 建立投票結果；不判定通過與否（由 isProposalApproved 負責），也不限制票數範圍。 */
export function createProposalVoteResult(
  approveCount: number,
  rejectCount: number,
): ProposalVoteResult {
  return { approveCount, rejectCount };
}

/** 設定本次提案的公開投票結果：僅限 VOTING、尚無結果且已有提案時；不切換階段、不結算。 */
export function setProposalVoteResult(
  state: GameState,
  voteResult: ProposalVoteResult,
): GameState {
  if (
    state.phase !== "VOTING" ||
    state.endResult !== null ||
    state.currentProposal === null
  ) {
    return state;
  }
  return {
    ...state,
    currentVoteResult: createProposalVoteResult(
      voteResult.approveCount,
      voteResult.rejectCount,
    ),
  };
}

/** 依 currentVoteResult 結算目前提案：用 isProposalApproved 判定後交給 resolveProposalVote，並清除票數。 */
export function resolveCurrentProposalVote(state: GameState): GameState {
  if (
    state.phase !== "VOTING" ||
    state.endResult !== null ||
    state.currentProposal === null ||
    state.currentVoteResult === null
  ) {
    return state;
  }

  const { approveCount, rejectCount } = state.currentVoteResult;
  const resolved = resolveProposalVote(
    state,
    isProposalApproved(approveCount, rejectCount),
  );
  return resolved === state ? state : { ...resolved, currentVoteResult: null };
}

/** 任務輸入：本次任務收到的客訴卡數，以及整場遊戲的玩家人數（尚不含輪次）。 */
export type MissionInput = {
  complaintCards: number;
  playerCount: number;
};

/** 建立任務輸入；不判斷任務成敗（由 resolveMission 負責），也不限制數值範圍。 */
export function createMissionInput(
  complaintCards: number,
  playerCount: number,
): MissionInput {
  return { complaintCards, playerCount };
}

/** 提交任務輸入：以 state.playerCount 與 state.round 呼叫 resolveMission 算出任務結果（不採用 missionInput.playerCount），再交給 resolveMissionResult 更新狀態。僅限 MISSION 且尚無結果。 */
export function submitMissionResult(
  state: GameState,
  missionInput: MissionInput,
): GameState {
  if (state.phase !== "MISSION" || state.endResult !== null) return state;

  const missionResult = resolveMission(
    missionInput.complaintCards,
    state.playerCount,
    state.round,
  );
  return resolveMissionResult(state, missionResult);
}
