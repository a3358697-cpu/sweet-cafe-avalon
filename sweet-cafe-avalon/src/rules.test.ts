import { describe, expect, it } from "vitest";
import {
  END_REASON_WINNER,
  applyEvilVictoryIfNeeded,
  applyMissionResult,
  applyProposalResult,
  applyReportResult,
  createInitialGameState,
  createMissionInput,
  createProposal,
  createProposalVoteResult,
  enterReportPhaseIfReady,
  GAME_END_REASONS,
  GAME_PHASES,
  canTransitionPhase,
  HOST_MODES,
  type GameEndReason,
  type GameEndResult,
  type GamePhase,
  type GameState,
  type HostMode,
  type MissionInput,
  type MissionResult,
  type Proposal,
  type ProposalVoteResult,
  addComplaintCards,
  isEvilWinByComplaintCards,
  isEvilVictoryConditionMet,
  isEvilWinByRejections,
  isMissionFailed,
  isProposalApproved,
  isValidPlayerCount,
  MAX_PLAYERS,
  MIN_PLAYERS,
  nextRejectionCount,
  resolveCurrentProposalVote,
  resolveMission,
  resolveMissionResult,
  resolveProposalVote,
  resolveReport,
  setProposalVoteResult,
  shouldEnterReportPhase,
  startGame,
  submitMissionResult,
  submitProposal,
} from "./rules";

describe("isProposalApproved", () => {
  it("贊成多於反對時通過", () => {
    expect(isProposalApproved(4, 3)).toBe(true);
  });

  it("平票視為失敗", () => {
    expect(isProposalApproved(3, 3)).toBe(false);
  });

  it("反對多於贊成時失敗", () => {
    expect(isProposalApproved(2, 5)).toBe(false);
  });
});

describe("nextRejectionCount", () => {
  it("提案失敗時次數加 1", () => {
    expect(nextRejectionCount(0, false)).toBe(1);
    expect(nextRejectionCount(3, false)).toBe(4);
  });

  it("提案通過時次數歸零", () => {
    expect(nextRejectionCount(4, true)).toBe(0);
  });
});

describe("isEvilWinByRejections", () => {
  it("連續失敗未滿 5 次時奧客不獲勝", () => {
    expect(isEvilWinByRejections(4)).toBe(false);
  });

  it("連續失敗 5 次時奧客獲勝", () => {
    expect(isEvilWinByRejections(5)).toBe(true);
  });
});

describe("isMissionFailed", () => {
  it("一般任務沒有客訴卡時成功", () => {
    expect(isMissionFailed(0, 7, 1)).toBe(false);
  });

  it("一般任務有 1 張客訴卡就失敗", () => {
    expect(isMissionFailed(1, 7, 1)).toBe(true);
    expect(isMissionFailed(1, 10, 3)).toBe(true);
  });

  it("8 人以上的第 4 輪，1 張客訴卡不會失敗", () => {
    expect(isMissionFailed(1, 8, 4)).toBe(false);
  });

  it("8 人以上的第 4 輪，2 張客訴卡才失敗", () => {
    expect(isMissionFailed(2, 8, 4)).toBe(true);
    expect(isMissionFailed(2, 12, 4)).toBe(true);
  });

  it("未滿 8 人的第 4 輪仍是 1 張就失敗", () => {
    expect(isMissionFailed(1, 7, 4)).toBe(true);
  });

  it("8 人以上的其他輪次仍是 1 張就失敗", () => {
    expect(isMissionFailed(1, 8, 5)).toBe(true);
  });
});

describe("isEvilWinByComplaintCards", () => {
  it("累積少於 3 張時不觸發勝利條件", () => {
    expect(isEvilWinByComplaintCards(0)).toBe(false);
    expect(isEvilWinByComplaintCards(2)).toBe(false);
  });

  it("累積達 3 張時奧客獲勝", () => {
    expect(isEvilWinByComplaintCards(3)).toBe(true);
  });

  it("累積超過 3 張時奧客獲勝", () => {
    expect(isEvilWinByComplaintCards(4)).toBe(true);
  });
});

describe("addComplaintCards", () => {
  it("每輪的卡片都累加到總張數", () => {
    expect(addComplaintCards(0, 1)).toBe(1);
    expect(addComplaintCards(2, 0)).toBe(2);
  });

  it("任務成功時出現的卡片仍會累積（8 人以上第 4 輪 1 張）", () => {
    expect(isMissionFailed(1, 8, 4)).toBe(false);
    const total = addComplaintCards(2, 1);
    expect(total).toBe(3);
    expect(isEvilWinByComplaintCards(total)).toBe(true);
  });
});

describe("shouldEnterReportPhase", () => {
  it("成功任務少於 3 次時不進入檢舉階段", () => {
    expect(shouldEnterReportPhase(0)).toBe(false);
    expect(shouldEnterReportPhase(2)).toBe(false);
  });

  it("成功任務達 3 次時進入檢舉階段", () => {
    expect(shouldEnterReportPhase(3)).toBe(true);
  });
});

describe("resolveReport", () => {
  it("指認到真正的店長，奧客陣營獲勝", () => {
    expect(resolveReport("p3", "p3")).toBe("evil");
  });

  it("指認錯誤，店員陣營獲勝", () => {
    expect(resolveReport("p2", "p3")).toBe("staff");
  });
});

describe("isValidPlayerCount", () => {
  it("6～12 人有效", () => {
    expect(isValidPlayerCount(6)).toBe(true);
    expect(isValidPlayerCount(9)).toBe(true);
    expect(isValidPlayerCount(12)).toBe(true);
  });

  it("少於 6 人無效", () => {
    expect(isValidPlayerCount(5)).toBe(false);
    expect(isValidPlayerCount(0)).toBe(false);
  });

  it("多於 12 人無效", () => {
    expect(isValidPlayerCount(13)).toBe(false);
  });

  it("非整數無效", () => {
    expect(isValidPlayerCount(6.5)).toBe(false);
    expect(isValidPlayerCount(Number.NaN)).toBe(false);
  });
});

describe("HostMode", () => {
  it("支援 HOST_ONLY 與 HOST_IS_PLAYER 兩種模式", () => {
    expect(HOST_MODES).toEqual(["HOST_ONLY", "HOST_IS_PLAYER"]);
  });

  it("兩種模式都能作為 HostMode 使用", () => {
    const hostOnly: HostMode = "HOST_ONLY";
    const hostIsPlayer: HostMode = "HOST_IS_PLAYER";
    expect(HOST_MODES).toContain(hostOnly);
    expect(HOST_MODES).toContain(hostIsPlayer);
  });
});

describe("GamePhase", () => {
  it("包含六個遊戲階段，且順序固定", () => {
    expect(GAME_PHASES).toEqual([
      "LOBBY",
      "PROPOSAL",
      "VOTING",
      "MISSION",
      "REPORT",
      "FINISHED",
    ]);
  });

  it("階段名稱不重複", () => {
    expect(new Set(GAME_PHASES).size).toBe(GAME_PHASES.length);
  });

  it("每個階段都能作為 GamePhase 使用", () => {
    const phases: GamePhase[] = ["LOBBY", "REPORT", "FINISHED"];
    for (const phase of phases) expect(GAME_PHASES).toContain(phase);
  });
});

describe("canTransitionPhase", () => {
  const allowed: [GamePhase, GamePhase][] = [
    ["LOBBY", "PROPOSAL"],
    ["PROPOSAL", "VOTING"],
    ["VOTING", "PROPOSAL"],
    ["VOTING", "MISSION"],
    ["MISSION", "PROPOSAL"],
    ["MISSION", "REPORT"],
    ["REPORT", "FINISHED"],
    ["VOTING", "FINISHED"], // 連續 5 次提案失敗，奧客獲勝
    ["MISSION", "FINISHED"], // 累積 3 張客訴卡，奧客獲勝
  ];

  it("允許的九種轉換回傳 true", () => {
    for (const [from, to] of allowed) {
      expect(canTransitionPhase(from, to)).toBe(true);
    }
  });

  it("其他轉換一律回傳 false", () => {
    for (const from of GAME_PHASES) {
      for (const to of GAME_PHASES) {
        const isAllowed = allowed.some(([f, t]) => f === from && t === to);
        if (!isAllowed) expect(canTransitionPhase(from, to)).toBe(false);
      }
    }
  });

  it("轉換到同一階段回傳 false", () => {
    for (const phase of GAME_PHASES) {
      expect(canTransitionPhase(phase, phase)).toBe(false);
    }
  });

  it("奧客獲勝可由 VOTING 或 MISSION 直接結束遊戲", () => {
    expect(canTransitionPhase("VOTING", "FINISHED")).toBe(true);
    expect(canTransitionPhase("MISSION", "FINISHED")).toBe(true);
  });

  it("其他階段不能直接跳到 FINISHED", () => {
    expect(canTransitionPhase("LOBBY", "FINISHED")).toBe(false);
    expect(canTransitionPhase("PROPOSAL", "FINISHED")).toBe(false);
  });

  it("不可跳階段或倒退", () => {
    expect(canTransitionPhase("LOBBY", "MISSION")).toBe(false);
    expect(canTransitionPhase("PROPOSAL", "MISSION")).toBe(false);
    expect(canTransitionPhase("REPORT", "MISSION")).toBe(false);
  });

  it("遊戲結束後不能再轉換", () => {
    for (const to of GAME_PHASES) {
      expect(canTransitionPhase("FINISHED", to)).toBe(false);
    }
  });
});

describe("isEvilVictoryConditionMet", () => {
  it("兩個條件都未達標時回傳 false", () => {
    expect(isEvilVictoryConditionMet(0, 0)).toBe(false);
    expect(isEvilVictoryConditionMet(4, 2)).toBe(false);
  });

  it("連續提案失敗達 5 次時回傳 true", () => {
    expect(isEvilVictoryConditionMet(5, 0)).toBe(true);
  });

  it("累積客訴卡達 3 張時回傳 true", () => {
    expect(isEvilVictoryConditionMet(0, 3)).toBe(true);
  });

  it("兩個條件同時達標時回傳 true", () => {
    expect(isEvilVictoryConditionMet(5, 3)).toBe(true);
  });
});

describe("GameEndReason", () => {
  it("包含四種遊戲結束原因", () => {
    expect(GAME_END_REASONS).toEqual([
      "EVIL_REJECTIONS",
      "EVIL_COMPLAINT_CARDS",
      "EVIL_REPORT_CORRECT",
      "STAFF_REPORT_WRONG",
    ]);
  });

  it("結束原因不重複", () => {
    expect(new Set(GAME_END_REASONS).size).toBe(GAME_END_REASONS.length);
  });

  it("每個原因都能作為 GameEndReason 使用", () => {
    const reasons: GameEndReason[] = ["EVIL_REJECTIONS", "STAFF_REPORT_WRONG"];
    for (const reason of reasons) expect(GAME_END_REASONS).toContain(reason);
  });
});

describe("END_REASON_WINNER", () => {
  it("每種結束原因都對應到獲勝陣營", () => {
    expect(Object.keys(END_REASON_WINNER).sort()).toEqual(
      [...GAME_END_REASONS].sort(),
    );
  });

  it("奧客相關原因對應 evil", () => {
    expect(END_REASON_WINNER.EVIL_REJECTIONS).toBe("evil");
    expect(END_REASON_WINNER.EVIL_COMPLAINT_CARDS).toBe("evil");
    expect(END_REASON_WINNER.EVIL_REPORT_CORRECT).toBe("evil");
  });

  it("檢舉錯誤對應 staff", () => {
    expect(END_REASON_WINNER.STAFF_REPORT_WRONG).toBe("staff");
  });

  it("與檢舉結果判定一致", () => {
    expect(resolveReport("p1", "p1")).toBe(END_REASON_WINNER.EVIL_REPORT_CORRECT);
    expect(resolveReport("p2", "p1")).toBe(END_REASON_WINNER.STAFF_REPORT_WRONG);
  });

  it("可組成 GameEndResult", () => {
    const result: GameEndResult = {
      winner: END_REASON_WINNER.EVIL_COMPLAINT_CARDS,
      reason: "EVIL_COMPLAINT_CARDS",
    };
    expect(result).toEqual({ winner: "evil", reason: "EVIL_COMPLAINT_CARDS" });
  });
});

describe("resolveMission", () => {
  it("一般任務 0 張客訴卡：成功，新增 0 張", () => {
    expect(resolveMission(0, 7, 1)).toEqual({
      failed: false,
      totalComplaintCardsAdded: 0,
    });
  });

  it("一般任務 1 張客訴卡：失敗，新增 1 張", () => {
    expect(resolveMission(1, 7, 2)).toEqual({
      failed: true,
      totalComplaintCardsAdded: 1,
    });
  });

  it("8 人以上第 4 輪 1 張客訴卡：任務成功，但卡片仍計入", () => {
    expect(resolveMission(1, 8, 4)).toEqual({
      failed: false,
      totalComplaintCardsAdded: 1,
    });
  });

  it("8 人以上第 4 輪 2 張客訴卡：任務失敗，新增 2 張", () => {
    expect(resolveMission(2, 8, 4)).toEqual({
      failed: true,
      totalComplaintCardsAdded: 2,
    });
  });

  it("未滿 8 人第 4 輪 1 張客訴卡：仍然失敗", () => {
    expect(resolveMission(1, 7, 4)).toEqual({
      failed: true,
      totalComplaintCardsAdded: 1,
    });
  });
});

describe("createInitialGameState", () => {
  it("建立初始狀態：LOBBY、計數為 0、尚未結束", () => {
    expect(createInitialGameState(8)).toEqual({
      phase: "LOBBY",
      playerCount: 8,
      consecutiveRejections: 0,
      totalComplaintCards: 0,
      successfulMissions: 0,
      endResult: null,
      currentProposal: null,
      currentVoteResult: null,
      round: 1,
    });
  });

  it("最少人數 6 人", () => {
    const state: GameState = createInitialGameState(MIN_PLAYERS);
    expect(state.playerCount).toBe(6);
    expect(state.phase).toBe("LOBBY");
  });

  it("最多人數 12 人", () => {
    const state: GameState = createInitialGameState(MAX_PLAYERS);
    expect(state.playerCount).toBe(12);
    expect(state.endResult).toBeNull();
  });

  it("每次呼叫都回傳獨立的物件", () => {
    const a = createInitialGameState(6);
    const b = createInitialGameState(6);
    a.totalComplaintCards = 2;
    expect(b.totalComplaintCards).toBe(0);
  });

  it("結束後可保存勝方與原因", () => {
    const state = createInitialGameState(6);
    state.endResult = { winner: "evil", reason: "EVIL_REJECTIONS" };
    expect(state.endResult.winner).toBe("evil");
  });
});

describe("applyProposalResult", () => {
  const base: GameState = {
    phase: "VOTING",
    playerCount: 8,
    consecutiveRejections: 2,
    totalComplaintCards: 1,
    successfulMissions: 2,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("提案失敗：連續失敗次數加 1，其他欄位不變", () => {
    expect(applyProposalResult(base, false)).toEqual({
      ...base,
      consecutiveRejections: 3,
    });
  });

  it("提案通過：連續失敗次數重設為 0，其他欄位不變", () => {
    expect(applyProposalResult(base, true)).toEqual({
      ...base,
      consecutiveRejections: 0,
    });
  });

  it("連續失敗會累計", () => {
    let state = createInitialGameState(6);
    for (let i = 0; i < 3; i++) state = applyProposalResult(state, false);
    expect(state.consecutiveRejections).toBe(3);
  });

  it("通過後重設，再失敗從 1 重新計算", () => {
    let state = { ...base, consecutiveRejections: 4 };
    state = applyProposalResult(state, true);
    expect(state.consecutiveRejections).toBe(0);
    state = applyProposalResult(state, false);
    expect(state.consecutiveRejections).toBe(1);
  });

  it("連續失敗達 5 次也只更新計數，不判定勝負、不切換階段", () => {
    const next = applyProposalResult({ ...base, consecutiveRejections: 4 }, false);
    expect(next.consecutiveRejections).toBe(5);
    expect(next.phase).toBe("VOTING");
    expect(next.endResult).toBeNull();
  });

  it("不修改原本的 state，並回傳新物件", () => {
    const before = { ...base };
    const next = applyProposalResult(base, false);
    expect(base).toEqual(before);
    expect(next).not.toBe(base);
  });
});

describe("applyMissionResult", () => {
  const base: GameState = {
    phase: "MISSION",
    playerCount: 8,
    consecutiveRejections: 1,
    totalComplaintCards: 1,
    successfulMissions: 1,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("任務成功且無客訴卡：成功任務數加 1，客訴卡不變", () => {
    const result: MissionResult = { failed: false, totalComplaintCardsAdded: 0 };
    expect(applyMissionResult(base, result)).toEqual({
      ...base,
      successfulMissions: 2,
    });
  });

  it("任務失敗：客訴卡累加，成功任務數不變", () => {
    const result: MissionResult = { failed: true, totalComplaintCardsAdded: 1 };
    expect(applyMissionResult(base, result)).toEqual({
      ...base,
      totalComplaintCards: 2,
    });
  });

  it("任務成功但仍有客訴卡：成功任務數加 1，客訴卡也照常累加", () => {
    const result: MissionResult = { failed: false, totalComplaintCardsAdded: 1 };
    expect(applyMissionResult(base, result)).toEqual({
      ...base,
      totalComplaintCards: 2,
      successfulMissions: 2,
    });
  });

  it("客訴卡會跨多次任務累計", () => {
    let state = createInitialGameState(8);
    state = applyMissionResult(state, { failed: true, totalComplaintCardsAdded: 1 });
    state = applyMissionResult(state, { failed: false, totalComplaintCardsAdded: 1 });
    state = applyMissionResult(state, { failed: true, totalComplaintCardsAdded: 2 });
    expect(state.totalComplaintCards).toBe(4);
    expect(state.successfulMissions).toBe(1);
  });

  it("只更新計數，不判定勝負、不切換階段", () => {
    const near: GameState = { ...base, totalComplaintCards: 2, successfulMissions: 2 };
    const next = applyMissionResult(near, { failed: false, totalComplaintCardsAdded: 1 });
    expect(next.totalComplaintCards).toBe(3);
    expect(next.successfulMissions).toBe(3);
    expect(next.phase).toBe("MISSION");
    expect(next.endResult).toBeNull();
    expect(next.consecutiveRejections).toBe(1);
  });

  it("不修改原本的 state 與 missionResult，並回傳新物件", () => {
    const stateBefore = { ...base };
    const result: MissionResult = { failed: false, totalComplaintCardsAdded: 1 };
    const resultBefore = { ...result };
    const next = applyMissionResult(base, result);
    expect(base).toEqual(stateBefore);
    expect(result).toEqual(resultBefore);
    expect(next).not.toBe(base);
  });
});

describe("applyEvilVictoryIfNeeded", () => {
  const base: GameState = {
    phase: "VOTING",
    playerCount: 8,
    consecutiveRejections: 0,
    totalComplaintCards: 0,
    successfulMissions: 1,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("連續提案失敗達 5 次：奧客獲勝，原因 EVIL_REJECTIONS", () => {
    const next = applyEvilVictoryIfNeeded({ ...base, consecutiveRejections: 5 });
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_REJECTIONS,
      reason: "EVIL_REJECTIONS",
    });
  });

  it("累積客訴卡達 3 張：奧客獲勝，原因 EVIL_COMPLAINT_CARDS", () => {
    const next = applyEvilVictoryIfNeeded({ ...base, totalComplaintCards: 3 });
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_COMPLAINT_CARDS,
      reason: "EVIL_COMPLAINT_CARDS",
    });
  });

  it("兩個條件同時達標：優先使用 EVIL_REJECTIONS", () => {
    const next = applyEvilVictoryIfNeeded({
      ...base,
      consecutiveRejections: 5,
      totalComplaintCards: 3,
    });
    expect(next.endResult?.reason).toBe("EVIL_REJECTIONS");
    expect(next.endResult?.winner).toBe("evil");
  });

  it("尚未達標：原樣回傳狀態內容", () => {
    const state = { ...base, consecutiveRejections: 4, totalComplaintCards: 2 };
    expect(applyEvilVictoryIfNeeded(state)).toEqual(state);
  });

  it("已有 endResult：不覆蓋既有結果", () => {
    const state: GameState = {
      ...base,
      phase: "FINISHED",
      consecutiveRejections: 5,
      endResult: { winner: "staff", reason: "STAFF_REPORT_WRONG" },
    };
    expect(applyEvilVictoryIfNeeded(state)).toEqual(state);
  });

  it("phase 已是 FINISHED（即使 endResult 為 null）：不改動", () => {
    const state: GameState = { ...base, phase: "FINISHED", totalComplaintCards: 3 };
    expect(applyEvilVictoryIfNeeded(state)).toEqual(state);
  });

  it("達成勝利時回傳新物件，不修改原始 state", () => {
    const state = { ...base, consecutiveRejections: 5 };
    const before = { ...state };
    const next = applyEvilVictoryIfNeeded(state);
    expect(state).toEqual(before);
    expect(state.phase).toBe("VOTING");
    expect(state.endResult).toBeNull();
    expect(next).not.toBe(state);
  });

  it("其餘欄位保持不變", () => {
    const next = applyEvilVictoryIfNeeded({ ...base, totalComplaintCards: 3 });
    expect(next.playerCount).toBe(8);
    expect(next.successfulMissions).toBe(1);
    expect(next.consecutiveRejections).toBe(0);
  });
});

describe("applyReportResult", () => {
  const base: GameState = {
    phase: "REPORT",
    playerCount: 8,
    consecutiveRejections: 1,
    totalComplaintCards: 2,
    successfulMissions: 3,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("檢舉正確：奧客獲勝，原因 EVIL_REPORT_CORRECT，階段 FINISHED", () => {
    const next = applyReportResult(base, "p3", "p3");
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: "evil",
      reason: "EVIL_REPORT_CORRECT",
    });
  });

  it("檢舉錯誤：店員獲勝，原因 STAFF_REPORT_WRONG，階段 FINISHED", () => {
    const next = applyReportResult(base, "p2", "p3");
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: "staff",
      reason: "STAFF_REPORT_WRONG",
    });
  });

  it("結束原因與 END_REASON_WINNER 的勝方一致", () => {
    const evil = applyReportResult(base, "p3", "p3").endResult;
    const staff = applyReportResult(base, "p2", "p3").endResult;
    expect(evil?.winner).toBe(END_REASON_WINNER.EVIL_REPORT_CORRECT);
    expect(staff?.winner).toBe(END_REASON_WINNER.STAFF_REPORT_WRONG);
  });

  it("非 REPORT 階段：不套用，原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "REPORT") continue;
      const state: GameState = { ...base, phase };
      expect(applyReportResult(state, "p3", "p3")).toBe(state);
    }
  });

  it("已有 endResult：不覆蓋既有結果", () => {
    const state: GameState = {
      ...base,
      endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
    };
    expect(applyReportResult(state, "p2", "p3")).toBe(state);
  });

  it("其餘欄位保持不變", () => {
    const next = applyReportResult(base, "p3", "p3");
    expect(next.playerCount).toBe(8);
    expect(next.consecutiveRejections).toBe(1);
    expect(next.totalComplaintCards).toBe(2);
    expect(next.successfulMissions).toBe(3);
  });

  it("成功套用時回傳新物件，不修改原始 state", () => {
    const before = { ...base };
    const next = applyReportResult(base, "p3", "p3");
    expect(base).toEqual(before);
    expect(base.phase).toBe("REPORT");
    expect(base.endResult).toBeNull();
    expect(next).not.toBe(base);
  });
});

describe("enterReportPhaseIfReady", () => {
  const base: GameState = {
    phase: "MISSION",
    playerCount: 8,
    consecutiveRejections: 1,
    totalComplaintCards: 2,
    successfulMissions: 3,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("MISSION 階段且成功任務達標：切換到 REPORT，其餘欄位不變", () => {
    expect(enterReportPhaseIfReady(base)).toEqual({ ...base, phase: "REPORT" });
  });

  it("切換結果符合 canTransitionPhase", () => {
    const next = enterReportPhaseIfReady(base);
    expect(canTransitionPhase(base.phase, next.phase)).toBe(true);
  });

  it("成功任務未達標：原樣回傳", () => {
    const state: GameState = { ...base, successfulMissions: 2 };
    expect(enterReportPhaseIfReady(state)).toBe(state);
  });

  it("不在 MISSION 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "MISSION") continue;
      const state: GameState = { ...base, phase };
      expect(enterReportPhaseIfReady(state)).toBe(state);
    }
  });

  it("已有 endResult：原樣回傳", () => {
    const state: GameState = {
      ...base,
      endResult: { winner: "evil", reason: "EVIL_COMPLAINT_CARDS" },
    };
    expect(enterReportPhaseIfReady(state)).toBe(state);
  });

  it("成功切換時回傳新物件，不修改原始 state", () => {
    const before = { ...base };
    const next = enterReportPhaseIfReady(base);
    expect(base).toEqual(before);
    expect(base.phase).toBe("MISSION");
    expect(next).not.toBe(base);
  });
});

describe("resolveProposalVote", () => {
  const base: GameState = {
    phase: "VOTING",
    playerCount: 8,
    consecutiveRejections: 2,
    totalComplaintCards: 1,
    successfulMissions: 1,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("提案通過：連續失敗歸零，進入 MISSION", () => {
    const next = resolveProposalVote(base, true);
    expect(next).toEqual({ ...base, phase: "MISSION", consecutiveRejections: 0 });
    expect(canTransitionPhase(base.phase, next.phase)).toBe(true);
  });

  it("提案未通過：連續失敗加 1，回到 PROPOSAL 重新提案", () => {
    const next = resolveProposalVote(base, false);
    expect(next).toEqual({ ...base, phase: "PROPOSAL", consecutiveRejections: 3 });
    expect(canTransitionPhase(base.phase, next.phase)).toBe(true);
  });

  it("連續失敗達 5 次：奧客獲勝，階段 FINISHED，原因 EVIL_REJECTIONS", () => {
    const state: GameState = { ...base, consecutiveRejections: 4 };
    const next = resolveProposalVote(state, false);
    expect(next.consecutiveRejections).toBe(5);
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_REJECTIONS,
      reason: "EVIL_REJECTIONS",
    });
    expect(canTransitionPhase(state.phase, next.phase)).toBe(true);
  });

  it("第 5 次提案若通過，不算失敗，進入 MISSION", () => {
    const state: GameState = { ...base, consecutiveRejections: 4 };
    const next = resolveProposalVote(state, true);
    expect(next.phase).toBe("MISSION");
    expect(next.consecutiveRejections).toBe(0);
    expect(next.endResult).toBeNull();
  });

  it("不修改其他計數", () => {
    const next = resolveProposalVote(base, false);
    expect(next.playerCount).toBe(8);
    expect(next.totalComplaintCards).toBe(1);
    expect(next.successfulMissions).toBe(1);
  });

  it("非 VOTING 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "VOTING") continue;
      const state: GameState = { ...base, phase };
      expect(resolveProposalVote(state, true)).toBe(state);
      expect(resolveProposalVote(state, false)).toBe(state);
    }
  });

  it("已有 endResult：原樣回傳", () => {
    const state: GameState = {
      ...base,
      endResult: { winner: "evil", reason: "EVIL_COMPLAINT_CARDS" },
    };
    expect(resolveProposalVote(state, true)).toBe(state);
    expect(resolveProposalVote(state, false)).toBe(state);
  });

  it("成功處理時回傳新物件，不修改原始 state", () => {
    const before = { ...base };
    const approvedResult = resolveProposalVote(base, true);
    const rejectedResult = resolveProposalVote(base, false);
    expect(base).toEqual(before);
    expect(base.phase).toBe("VOTING");
    expect(approvedResult).not.toBe(base);
    expect(rejectedResult).not.toBe(base);
  });
});

describe("resolveMissionResult", () => {
  const base: GameState = {
    phase: "MISSION",
    playerCount: 8,
    consecutiveRejections: 0,
    totalComplaintCards: 0,
    successfulMissions: 1,
    endResult: null,
    currentProposal: null,
    currentVoteResult: null,
    round: 1,
  };

  it("任務成功：成功任務數加 1，回到 PROPOSAL", () => {
    const next = resolveMissionResult(base, {
      failed: false,
      totalComplaintCardsAdded: 0,
    });
    expect(next).toEqual({ ...base, phase: "PROPOSAL", successfulMissions: 2, round: 2 });
    expect(canTransitionPhase(base.phase, next.phase)).toBe(true);
  });

  it("任務失敗：客訴卡累加，成功任務數不變，回到 PROPOSAL", () => {
    const next = resolveMissionResult(base, {
      failed: true,
      totalComplaintCardsAdded: 1,
    });
    expect(next).toEqual({ ...base, phase: "PROPOSAL", totalComplaintCards: 1, round: 2 });
  });

  it("客訴卡累積達 3 張：奧客獲勝，階段 FINISHED", () => {
    const state: GameState = { ...base, totalComplaintCards: 2 };
    const next = resolveMissionResult(state, {
      failed: true,
      totalComplaintCardsAdded: 1,
    });
    expect(next.totalComplaintCards).toBe(3);
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_COMPLAINT_CARDS,
      reason: "EVIL_COMPLAINT_CARDS",
    });
    expect(canTransitionPhase(state.phase, next.phase)).toBe(true);
  });

  it("成功任務達 3 次：進入 REPORT，尚無結果", () => {
    const state: GameState = { ...base, successfulMissions: 2 };
    const next = resolveMissionResult(state, {
      failed: false,
      totalComplaintCardsAdded: 0,
    });
    expect(next.successfulMissions).toBe(3);
    expect(next.phase).toBe("REPORT");
    expect(next.endResult).toBeNull();
    expect(canTransitionPhase(state.phase, next.phase)).toBe(true);
  });

  it("成功任務達 3 次但客訴卡同時達 3 張：奧客勝利優先", () => {
    const state: GameState = {
      ...base,
      successfulMissions: 2,
      totalComplaintCards: 2,
    };
    const next = resolveMissionResult(state, {
      failed: false,
      totalComplaintCardsAdded: 1,
    });
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult?.reason).toBe("EVIL_COMPLAINT_CARDS");
  });

  it("非 MISSION 階段：原樣回傳", () => {
    const result = { failed: true, totalComplaintCardsAdded: 1 };
    for (const phase of GAME_PHASES) {
      if (phase === "MISSION") continue;
      const state: GameState = { ...base, phase };
      expect(resolveMissionResult(state, result)).toBe(state);
    }
  });

  it("已有 endResult：原樣回傳", () => {
    const state: GameState = {
      ...base,
      endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
    };
    const next = resolveMissionResult(state, {
      failed: true,
      totalComplaintCardsAdded: 3,
    });
    expect(next).toBe(state);
  });

  it("成功處理時回傳新物件，不修改原始 state 與 missionResult", () => {
    const stateBefore = { ...base };
    const result: MissionResult = { failed: false, totalComplaintCardsAdded: 1 };
    const resultBefore = { ...result };
    const next = resolveMissionResult(base, result);
    expect(base).toEqual(stateBefore);
    expect(base.phase).toBe("MISSION");
    expect(result).toEqual(resultBefore);
    expect(next).not.toBe(base);
  });
});

describe("startGame", () => {
  it("合法人數（6、9、12 人）成功開始，只改變 phase", () => {
    for (const count of [MIN_PLAYERS, 9, MAX_PLAYERS]) {
      const state = createInitialGameState(count);
      const next = startGame(state);
      expect(next).toEqual({ ...state, phase: "PROPOSAL" });
      expect(canTransitionPhase(state.phase, next.phase)).toBe(true);
    }
  });

  it("低於最少人數：原樣回傳", () => {
    const state = createInitialGameState(MIN_PLAYERS - 1);
    expect(startGame(state)).toBe(state);
  });

  it("超過最多人數：原樣回傳", () => {
    const state = createInitialGameState(MAX_PLAYERS + 1);
    expect(startGame(state)).toBe(state);
  });

  it("非整數人數：原樣回傳", () => {
    const state = createInitialGameState(6.5);
    expect(startGame(state)).toBe(state);
  });

  it("非 LOBBY 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "LOBBY") continue;
      const state: GameState = { ...createInitialGameState(8), phase };
      expect(startGame(state)).toBe(state);
    }
  });

  it("已有 endResult：原樣回傳", () => {
    const state: GameState = {
      ...createInitialGameState(8),
      endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
    };
    expect(startGame(state)).toBe(state);
  });

  it("成功開始時回傳新物件，不修改原始 state", () => {
    const state = createInitialGameState(8);
    const before = { ...state };
    const next = startGame(state);
    expect(state).toEqual(before);
    expect(state.phase).toBe("LOBBY");
    expect(next).not.toBe(state);
  });
});

describe("createProposal", () => {
  it("正常建立提案：保存提案者與隊伍", () => {
    const proposal: Proposal = createProposal("p1", ["p1", "p2", "p3"]);
    expect(proposal).toEqual({ leaderId: "p1", teamMemberIds: ["p1", "p2", "p3"] });
  });

  it("空隊伍仍可建立（目前不驗證隊伍人數）", () => {
    expect(createProposal("p1", [])).toEqual({ leaderId: "p1", teamMemberIds: [] });
  });

  it("複製隊伍陣列，不與傳入的陣列共用同一個參考", () => {
    const team = ["p1", "p2"];
    const proposal = createProposal("p1", team);
    expect(proposal.teamMemberIds).not.toBe(team);
    expect(proposal.teamMemberIds).toEqual(team);
  });

  it("修改原陣列不會影響已建立的提案", () => {
    const team = ["p1", "p2"];
    const proposal = createProposal("p1", team);
    team.push("p3");
    team[0] = "px";
    expect(proposal.teamMemberIds).toEqual(["p1", "p2"]);
  });

  it("修改提案內的陣列也不會影響原陣列", () => {
    const team = ["p1", "p2"];
    const proposal = createProposal("p1", team);
    proposal.teamMemberIds.push("p9");
    expect(team).toEqual(["p1", "p2"]);
  });
});

describe("submitProposal", () => {
  const base: GameState = {
    ...createInitialGameState(8),
    phase: "PROPOSAL",
    consecutiveRejections: 1,
    totalComplaintCards: 1,
    successfulMissions: 1,
  };

  it("初始狀態沒有目前提案", () => {
    expect(createInitialGameState(6).currentProposal).toBeNull();
  });

  it("成功提交：保存提案並進入 VOTING，其他欄位不變", () => {
    const proposal = createProposal("p1", ["p1", "p2"]);
    const next = submitProposal(base, proposal);
    expect(next).toEqual({ ...base, phase: "VOTING", currentProposal: proposal });
    expect(canTransitionPhase(base.phase, next.phase)).toBe(true);
  });

  it("保存的是提案複本，包含複製 teamMemberIds", () => {
    const proposal = createProposal("p1", ["p1", "p2"]);
    const next = submitProposal(base, proposal);
    expect(next.currentProposal).not.toBe(proposal);
    expect(next.currentProposal?.teamMemberIds).not.toBe(proposal.teamMemberIds);
    proposal.teamMemberIds.push("p3");
    expect(next.currentProposal?.teamMemberIds).toEqual(["p1", "p2"]);
  });

  it("不驗證隊伍人數：空隊伍也能提交", () => {
    const next = submitProposal(base, createProposal("p1", []));
    expect(next.phase).toBe("VOTING");
    expect(next.currentProposal?.teamMemberIds).toEqual([]);
  });

  it("非 PROPOSAL 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "PROPOSAL") continue;
      const state: GameState = { ...base, phase };
      expect(submitProposal(state, createProposal("p1", ["p2"]))).toBe(state);
    }
  });

  it("已有 endResult：原樣回傳", () => {
    const state: GameState = {
      ...base,
      endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
    };
    expect(submitProposal(state, createProposal("p1", ["p2"]))).toBe(state);
  });

  it("成功提交時回傳新物件，不修改原始 state", () => {
    const before = { ...base };
    const next = submitProposal(base, createProposal("p1", ["p2"]));
    expect(base).toEqual(before);
    expect(base.phase).toBe("PROPOSAL");
    expect(base.currentProposal).toBeNull();
    expect(next).not.toBe(base);
  });
});

describe("currentProposal 生命週期", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);

  describe("resolveProposalVote", () => {
    const voting: GameState = {
      ...createInitialGameState(8),
      phase: "VOTING",
      consecutiveRejections: 1,
      currentProposal: proposal,
    };

    it("否決且遊戲繼續：回到 PROPOSAL 並清除 currentProposal", () => {
      const next = resolveProposalVote(voting, false);
      expect(next.phase).toBe("PROPOSAL");
      expect(next.currentProposal).toBeNull();
      expect(next.consecutiveRejections).toBe(2);
    });

    it("通過：進入 MISSION 並保留 currentProposal", () => {
      const next = resolveProposalVote(voting, true);
      expect(next.phase).toBe("MISSION");
      expect(next.currentProposal).toEqual(proposal);
    });

    it("不修改原始 state，原本的 currentProposal 仍在", () => {
      resolveProposalVote(voting, false);
      resolveProposalVote(voting, true);
      expect(voting.phase).toBe("VOTING");
      expect(voting.currentProposal).toEqual(proposal);
    });
  });

  describe("resolveMissionResult", () => {
    const mission: GameState = {
      ...createInitialGameState(8),
      phase: "MISSION",
      successfulMissions: 1,
      currentProposal: proposal,
    };

    it("任務成功後回到 PROPOSAL：清除 currentProposal", () => {
      const next = resolveMissionResult(mission, {
        failed: false,
        totalComplaintCardsAdded: 0,
      });
      expect(next.phase).toBe("PROPOSAL");
      expect(next.currentProposal).toBeNull();
    });

    it("任務失敗後回到 PROPOSAL：清除 currentProposal", () => {
      const next = resolveMissionResult(mission, {
        failed: true,
        totalComplaintCardsAdded: 1,
      });
      expect(next.phase).toBe("PROPOSAL");
      expect(next.currentProposal).toBeNull();
    });

    it("進入 REPORT：清除 currentProposal", () => {
      const state: GameState = { ...mission, successfulMissions: 2 };
      const next = resolveMissionResult(state, {
        failed: false,
        totalComplaintCardsAdded: 0,
      });
      expect(next.phase).toBe("REPORT");
      expect(next.currentProposal).toBeNull();
    });

    it("進入 FINISHED（客訴卡達標）：清除 currentProposal", () => {
      const state: GameState = { ...mission, totalComplaintCards: 2 };
      const next = resolveMissionResult(state, {
        failed: true,
        totalComplaintCardsAdded: 1,
      });
      expect(next.phase).toBe("FINISHED");
      expect(next.endResult?.reason).toBe("EVIL_COMPLAINT_CARDS");
      expect(next.currentProposal).toBeNull();
    });

    it("勝負優先順序與計數不受影響", () => {
      const state: GameState = {
        ...mission,
        successfulMissions: 2,
        totalComplaintCards: 2,
      };
      const next = resolveMissionResult(state, {
        failed: false,
        totalComplaintCardsAdded: 1,
      });
      expect(next.phase).toBe("FINISHED");
      expect(next.successfulMissions).toBe(3);
      expect(next.totalComplaintCards).toBe(3);
    });

    it("不修改原始 state，原本的 currentProposal 仍在", () => {
      resolveMissionResult(mission, { failed: false, totalComplaintCardsAdded: 0 });
      expect(mission.phase).toBe("MISSION");
      expect(mission.currentProposal).toEqual(proposal);
    });
  });
});

describe("resolveProposalVote：遊戲結束時清除 currentProposal", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  const fourthRejection: GameState = {
    ...createInitialGameState(8),
    phase: "VOTING",
    consecutiveRejections: 4,
    currentProposal: proposal,
  };

  it("連續 5 次否決導致奧客獲勝：FINISHED 且 currentProposal 為 null", () => {
    const next = resolveProposalVote(fourthRejection, false);
    expect(next.phase).toBe("FINISHED");
    expect(next.consecutiveRejections).toBe(5);
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_REJECTIONS,
      reason: "EVIL_REJECTIONS",
    });
    expect(next.currentProposal).toBeNull();
  });

  it("不修改原始 state，原本的 currentProposal 仍在", () => {
    const before = { ...fourthRejection };
    const next = resolveProposalVote(fourthRejection, false);
    expect(fourthRejection).toEqual(before);
    expect(fourthRejection.phase).toBe("VOTING");
    expect(fourthRejection.endResult).toBeNull();
    expect(fourthRejection.currentProposal).toEqual(proposal);
    expect(next).not.toBe(fourthRejection);
  });

  it("否決但客訴卡已達標而結束：同樣清除 currentProposal", () => {
    const state: GameState = { ...fourthRejection, consecutiveRejections: 0, totalComplaintCards: 3 };
    const next = resolveProposalVote(state, false);
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult?.reason).toBe("EVIL_COMPLAINT_CARDS");
    expect(next.currentProposal).toBeNull();
  });

  it("否決且遊戲繼續：仍清除 currentProposal，回到 PROPOSAL", () => {
    const state: GameState = { ...fourthRejection, consecutiveRejections: 1 };
    const next = resolveProposalVote(state, false);
    expect(next.phase).toBe("PROPOSAL");
    expect(next.currentProposal).toBeNull();
  });

  it("提案通過進入 MISSION：仍保留 currentProposal", () => {
    const next = resolveProposalVote(fourthRejection, true);
    expect(next.phase).toBe("MISSION");
    expect(next.consecutiveRejections).toBe(0);
    expect(next.currentProposal).toEqual(proposal);
  });
});

describe("createProposalVoteResult", () => {
  it("一般票數：保存贊成與反對總票數", () => {
    const result: ProposalVoteResult = createProposalVoteResult(5, 3);
    expect(result).toEqual({ approveCount: 5, rejectCount: 3 });
  });

  it("零票", () => {
    expect(createProposalVoteResult(0, 0)).toEqual({ approveCount: 0, rejectCount: 0 });
    expect(createProposalVoteResult(0, 4)).toEqual({ approveCount: 0, rejectCount: 4 });
  });

  it("平票：只記錄票數，不判定結果", () => {
    const result = createProposalVoteResult(4, 4);
    expect(result).toEqual({ approveCount: 4, rejectCount: 4 });
    expect(isProposalApproved(result.approveCount, result.rejectCount)).toBe(false);
  });

  it("每次呼叫回傳新物件", () => {
    expect(createProposalVoteResult(3, 2)).not.toBe(createProposalVoteResult(3, 2));
  });

  it("建立後修改原本的變數，不影響已建立的結果", () => {
    let approve = 5;
    let reject = 2;
    const result = createProposalVoteResult(approve, reject);
    approve = 0;
    reject = 9;
    expect(result).toEqual({ approveCount: 5, rejectCount: 2 });
    expect(approve + reject).toBe(9);
  });

  it("只包含兩個票數欄位，不記錄個別玩家投票", () => {
    expect(Object.keys(createProposalVoteResult(1, 1)).sort()).toEqual([
      "approveCount",
      "rejectCount",
    ]);
  });
});

describe("setProposalVoteResult", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  const voting: GameState = {
    ...createInitialGameState(8),
    phase: "VOTING",
    consecutiveRejections: 1,
    totalComplaintCards: 1,
    successfulMissions: 1,
    currentProposal: proposal,
  };

  it("初始狀態沒有投票結果", () => {
    expect(createInitialGameState(6).currentVoteResult).toBeNull();
  });

  it("成功設定：保存票數，其他欄位不變，且不切換階段", () => {
    const next = setProposalVoteResult(voting, createProposalVoteResult(5, 3));
    expect(next).toEqual({
      ...voting,
      currentVoteResult: { approveCount: 5, rejectCount: 3 },
    });
    expect(next.phase).toBe("VOTING");
    expect(next.consecutiveRejections).toBe(1);
  });

  it("保存的是複本，修改傳入的結果不影響狀態", () => {
    const vote: ProposalVoteResult = createProposalVoteResult(4, 4);
    const next = setProposalVoteResult(voting, vote);
    expect(next.currentVoteResult).not.toBe(vote);
    vote.approveCount = 99;
    expect(next.currentVoteResult).toEqual({ approveCount: 4, rejectCount: 4 });
  });

  it("不限制票數：零票也能設定", () => {
    const next = setProposalVoteResult(voting, createProposalVoteResult(0, 0));
    expect(next.currentVoteResult).toEqual({ approveCount: 0, rejectCount: 0 });
  });

  it("沒有目前提案：原樣回傳", () => {
    const state: GameState = { ...voting, currentProposal: null };
    expect(setProposalVoteResult(state, createProposalVoteResult(5, 3))).toBe(state);
  });

  it("非 VOTING 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "VOTING") continue;
      const state: GameState = { ...voting, phase };
      expect(setProposalVoteResult(state, createProposalVoteResult(5, 3))).toBe(state);
    }
  });

  it("遊戲已結束（有 endResult）：原樣回傳", () => {
    const state: GameState = {
      ...voting,
      endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
    };
    expect(setProposalVoteResult(state, createProposalVoteResult(5, 3))).toBe(state);
  });

  it("成功設定時回傳新物件，不修改原始 state", () => {
    const before = { ...voting };
    const next = setProposalVoteResult(voting, createProposalVoteResult(5, 3));
    expect(voting).toEqual(before);
    expect(voting.currentVoteResult).toBeNull();
    expect(next).not.toBe(voting);
  });
});

describe("resolveCurrentProposalVote", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  const voting = (approve: number, reject: number): GameState => ({
    ...createInitialGameState(8),
    phase: "VOTING",
    consecutiveRejections: 1,
    totalComplaintCards: 1,
    successfulMissions: 1,
    currentProposal: proposal,
    currentVoteResult: createProposalVoteResult(approve, reject),
  });

  it("贊成票較多：進入 MISSION，保留提案、清除票數、否決次數歸零", () => {
    const next = resolveCurrentProposalVote(voting(5, 3));
    expect(next.phase).toBe("MISSION");
    expect(next.currentProposal).toEqual(proposal);
    expect(next.currentVoteResult).toBeNull();
    expect(next.consecutiveRejections).toBe(0);
  });

  it("反對票較多：回到 PROPOSAL，清除提案與票數，否決次數加 1", () => {
    const next = resolveCurrentProposalVote(voting(3, 5));
    expect(next.phase).toBe("PROPOSAL");
    expect(next.currentProposal).toBeNull();
    expect(next.currentVoteResult).toBeNull();
    expect(next.consecutiveRejections).toBe(2);
  });

  it("平票視為否決", () => {
    const next = resolveCurrentProposalVote(voting(4, 4));
    expect(next.phase).toBe("PROPOSAL");
    expect(next.consecutiveRejections).toBe(2);
    expect(next.currentProposal).toBeNull();
    expect(next.currentVoteResult).toBeNull();
  });

  it("連續否決達 5 次：奧客獲勝，FINISHED，提案與票數都為 null", () => {
    const state: GameState = { ...voting(2, 6), consecutiveRejections: 4 };
    const next = resolveCurrentProposalVote(state);
    expect(next.phase).toBe("FINISHED");
    expect(next.consecutiveRejections).toBe(5);
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_REJECTIONS,
      reason: "EVIL_REJECTIONS",
    });
    expect(next.currentProposal).toBeNull();
    expect(next.currentVoteResult).toBeNull();
  });

  it("第 5 次提案若贊成較多：不算失敗，進入 MISSION", () => {
    const state: GameState = { ...voting(6, 2), consecutiveRejections: 4 };
    const next = resolveCurrentProposalVote(state);
    expect(next.phase).toBe("MISSION");
    expect(next.consecutiveRejections).toBe(0);
    expect(next.endResult).toBeNull();
  });

  it("與 resolveProposalVote 的階段與計數結果一致", () => {
    for (const [a, r] of [[5, 3], [3, 5], [4, 4]] as const) {
      const state = voting(a, r);
      const expected = resolveProposalVote(state, isProposalApproved(a, r));
      expect(resolveCurrentProposalVote(state)).toEqual({
        ...expected,
        currentVoteResult: null,
      });
    }
  });

  it("沒有票數：原樣回傳", () => {
    const state: GameState = { ...voting(5, 3), currentVoteResult: null };
    expect(resolveCurrentProposalVote(state)).toBe(state);
  });

  it("沒有提案：原樣回傳", () => {
    const state: GameState = { ...voting(5, 3), currentProposal: null };
    expect(resolveCurrentProposalVote(state)).toBe(state);
  });

  it("非 VOTING 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "VOTING") continue;
      const state: GameState = { ...voting(5, 3), phase };
      expect(resolveCurrentProposalVote(state)).toBe(state);
    }
  });

  it("已有結束結果：原樣回傳", () => {
    const state: GameState = {
      ...voting(5, 3),
      endResult: { winner: "evil", reason: "EVIL_COMPLAINT_CARDS" },
    };
    expect(resolveCurrentProposalVote(state)).toBe(state);
  });

  it("不修改原始 state，並回傳新物件", () => {
    for (const [a, r] of [[5, 3], [3, 5]] as const) {
      const state = voting(a, r);
      const before = {
        ...state,
        currentVoteResult: { ...state.currentVoteResult },
      };
      const next = resolveCurrentProposalVote(state);
      expect(state).toEqual(before);
      expect(state.phase).toBe("VOTING");
      expect(state.currentProposal).toEqual(proposal);
      expect(next).not.toBe(state);
    }
  });
});

describe("createMissionInput", () => {
  it("一般資料：保存客訴卡數與玩家人數", () => {
    const input: MissionInput = createMissionInput(2, 8);
    expect(input).toEqual({ complaintCards: 2, playerCount: 8 });
  });

  it("零張客訴卡", () => {
    expect(createMissionInput(0, 6)).toEqual({ complaintCards: 0, playerCount: 6 });
  });

  it("每次建立都回傳新物件", () => {
    expect(createMissionInput(1, 8)).not.toBe(createMissionInput(1, 8));
  });

  it("只包含 complaintCards 與 playerCount 兩個欄位", () => {
    expect(Object.keys(createMissionInput(1, 8)).sort()).toEqual([
      "complaintCards",
      "playerCount",
    ]);
  });

  it("不限制數值範圍，也不判斷任務成敗", () => {
    expect(createMissionInput(99, 3)).toEqual({ complaintCards: 99, playerCount: 3 });
  });
});

describe("submitMissionResult", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  const mission: GameState = {
    ...createInitialGameState(8),
    phase: "MISSION",
    successfulMissions: 1,
    currentProposal: proposal,
  };
  const at = (round: number, extra: Partial<GameState> = {}): GameState => ({
    ...mission,
    round,
    ...extra,
  });

  it("一般任務成功：成功任務數加 1，回到 PROPOSAL，進入下一輪", () => {
    const next = submitMissionResult(at(1), createMissionInput(0, 8));
    expect(next.phase).toBe("PROPOSAL");
    expect(next.successfulMissions).toBe(2);
    expect(next.totalComplaintCards).toBe(0);
    expect(next.currentProposal).toBeNull();
    expect(next.round).toBe(2);
  });

  it("任務失敗：客訴卡累積，成功任務數不變，回到 PROPOSAL，進入下一輪", () => {
    const next = submitMissionResult(at(2), createMissionInput(1, 8));
    expect(next.phase).toBe("PROPOSAL");
    expect(next.successfulMissions).toBe(1);
    expect(next.totalComplaintCards).toBe(1);
    expect(next.round).toBe(3);
  });

  it("8 人以上第 4 輪只收到 1 張客訴卡：任務仍成功，但卡片照常累積", () => {
    const next = submitMissionResult(at(4), createMissionInput(1, 8));
    expect(next.phase).toBe("PROPOSAL");
    expect(next.successfulMissions).toBe(2);
    expect(next.totalComplaintCards).toBe(1);
    expect(next.round).toBe(5);
  });

  it("同樣 1 張客訴卡，輪次由 state.round 決定：第 3 輪失敗、第 4 輪成功", () => {
    expect(submitMissionResult(at(3), createMissionInput(1, 8)).successfulMissions).toBe(1);
    expect(submitMissionResult(at(4), createMissionInput(1, 8)).successfulMissions).toBe(2);
  });

  it("8 人以上第 4 輪收到 2 張客訴卡：任務失敗", () => {
    const next = submitMissionResult(at(4), createMissionInput(2, 8));
    expect(next.successfulMissions).toBe(1);
    expect(next.totalComplaintCards).toBe(2);
    expect(next.round).toBe(5);
  });

  it("未滿 8 人第 4 輪 1 張客訴卡：任務失敗", () => {
    const state = at(4, { playerCount: 7 });
    const next = submitMissionResult(state, createMissionInput(1, 7));
    expect(next.successfulMissions).toBe(1);
    expect(next.totalComplaintCards).toBe(1);
  });

  it("客訴卡累積達 3 張：奧客獲勝，FINISHED，輪次不再增加", () => {
    const state = at(1, { totalComplaintCards: 2 });
    const next = submitMissionResult(state, createMissionInput(1, 8));
    expect(next.totalComplaintCards).toBe(3);
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult).toEqual({
      winner: END_REASON_WINNER.EVIL_COMPLAINT_CARDS,
      reason: "EVIL_COMPLAINT_CARDS",
    });
    expect(next.currentProposal).toBeNull();
    expect(next.round).toBe(1);
  });

  it("第 3 次成功任務：進入 REPORT，尚無結果，輪次不再增加", () => {
    const state = at(3, { successfulMissions: 2 });
    const next = submitMissionResult(state, createMissionInput(0, 8));
    expect(next.successfulMissions).toBe(3);
    expect(next.phase).toBe("REPORT");
    expect(next.endResult).toBeNull();
    expect(next.round).toBe(3);
  });

  it("結果與直接呼叫 resolveMission(state.round) + resolveMissionResult 一致", () => {
    for (const [cards, players, round] of [[0, 8, 1], [1, 8, 4], [2, 8, 4], [1, 7, 4]] as const) {
      const state = at(round, { playerCount: players });
      expect(submitMissionResult(state, createMissionInput(cards, players))).toEqual(
        resolveMissionResult(state, resolveMission(cards, players, round)),
      );
    }
  });

  it("非 MISSION 階段：原樣回傳", () => {
    for (const phase of GAME_PHASES) {
      if (phase === "MISSION") continue;
      const state = at(1, { phase });
      expect(submitMissionResult(state, createMissionInput(1, 8))).toBe(state);
    }
  });

  it("已有結束結果：原樣回傳", () => {
    const state = at(1, { endResult: { winner: "evil", reason: "EVIL_REJECTIONS" } });
    expect(submitMissionResult(state, createMissionInput(1, 8))).toBe(state);
  });

  it("不修改原始 state 與 missionInput，並回傳新物件（深拷貝比對）", () => {
    const state = at(1);
    const input = createMissionInput(1, 8);
    const stateBefore = structuredClone(state);
    const inputBefore = structuredClone(input);
    const next = submitMissionResult(state, input);
    expect(input).toEqual(inputBefore);
    expect(state).toEqual(stateBefore);
    expect(state.phase).toBe("MISSION");
    expect(state.round).toBe(1);
    expect(state.currentProposal).toEqual(proposal);
    expect(next).not.toBe(state);
  });
});

describe("舊投票結果殘留（currentVoteResult 只供當前提案使用）", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  const staleVote = createProposalVoteResult(5, 3);
  const voting = (rejections = 1): GameState => ({
    ...createInitialGameState(8),
    phase: "VOTING",
    consecutiveRejections: rejections,
    currentProposal: proposal,
    currentVoteResult: staleVote,
  });

  describe("submitProposal", () => {
    it("新提案不會保留上一輪票數", () => {
      const state: GameState = {
        ...createInitialGameState(8),
        phase: "PROPOSAL",
        currentVoteResult: staleVote,
      };
      const next = submitProposal(state, createProposal("p9", ["p9", "p8"]));
      expect(next.phase).toBe("VOTING");
      expect(next.currentProposal).toEqual({ leaderId: "p9", teamMemberIds: ["p9", "p8"] });
      expect(next.currentVoteResult).toBeNull();
    });

    it("條件不符時仍原樣回傳（不因此清除票數）", () => {
      const state: GameState = { ...voting(), phase: "MISSION" };
      expect(submitProposal(state, createProposal("p9", ["p9"]))).toBe(state);
    });
  });

  describe("resolveProposalVote", () => {
    it("提案通過：票數清除，提案仍保留", () => {
      const next = resolveProposalVote(voting(), true);
      expect(next.phase).toBe("MISSION");
      expect(next.currentVoteResult).toBeNull();
      expect(next.currentProposal).toEqual(proposal);
    });

    it("提案被否決且遊戲繼續：票數與提案都清除", () => {
      const next = resolveProposalVote(voting(), false);
      expect(next.phase).toBe("PROPOSAL");
      expect(next.currentVoteResult).toBeNull();
      expect(next.currentProposal).toBeNull();
    });

    it("連續 5 次否決結束遊戲：票數與提案都清除", () => {
      const next = resolveProposalVote(voting(4), false);
      expect(next.phase).toBe("FINISHED");
      expect(next.endResult?.reason).toBe("EVIL_REJECTIONS");
      expect(next.currentVoteResult).toBeNull();
      expect(next.currentProposal).toBeNull();
    });

    it("因客訴卡已達標而結束：票數與提案都清除", () => {
      const state: GameState = { ...voting(0), totalComplaintCards: 3 };
      const next = resolveProposalVote(state, false);
      expect(next.phase).toBe("FINISHED");
      expect(next.endResult?.reason).toBe("EVIL_COMPLAINT_CARDS");
      expect(next.currentVoteResult).toBeNull();
      expect(next.currentProposal).toBeNull();
    });

    it("不修改勝負、計數與其他欄位", () => {
      const next = resolveProposalVote(voting(2), false);
      expect(next).toEqual({
        ...voting(2),
        phase: "PROPOSAL",
        consecutiveRejections: 3,
        currentProposal: null,
        currentVoteResult: null,
      });
    });

    it("條件不符（非 VOTING、已有結果）時原樣回傳", () => {
      const notVoting: GameState = { ...voting(), phase: "MISSION" };
      expect(resolveProposalVote(notVoting, true)).toBe(notVoting);
      const ended: GameState = {
        ...voting(),
        endResult: { winner: "evil", reason: "EVIL_REJECTIONS" },
      };
      expect(resolveProposalVote(ended, false)).toBe(ended);
    });
  });

  describe("不修改原始 state（深拷貝比對）", () => {
    it("三種結果都不改動原始 state 與其巢狀物件", () => {
      for (const [rejections, approved] of [[1, true], [1, false], [4, false]] as const) {
        const state = voting(rejections);
        const before = structuredClone(state);
        const next = resolveProposalVote(state, approved);
        expect(state).toEqual(before);
        expect(state.currentVoteResult).toEqual(staleVote);
        expect(next).not.toBe(state);
      }
    });

    it("submitProposal 不改動原始 state 與傳入的提案", () => {
      const state: GameState = {
        ...createInitialGameState(8),
        phase: "PROPOSAL",
        currentVoteResult: staleVote,
      };
      const input = createProposal("p9", ["p9", "p8"]);
      const stateBefore = structuredClone(state);
      const inputBefore = structuredClone(input);
      submitProposal(state, input);
      expect(state).toEqual(stateBefore);
      expect(input).toEqual(inputBefore);
    });
  });

  describe("resolveCurrentProposalVote 的正常流程不受影響", () => {
    it("通過：進入 MISSION，保留提案，票數清除", () => {
      const next = resolveCurrentProposalVote(voting());
      expect(next.phase).toBe("MISSION");
      expect(next.currentProposal).toEqual(proposal);
      expect(next.currentVoteResult).toBeNull();
      expect(next.consecutiveRejections).toBe(0);
    });

    it("否決：回到 PROPOSAL，提案與票數清除，否決次數加 1", () => {
      const next = resolveCurrentProposalVote({
        ...voting(),
        currentVoteResult: createProposalVoteResult(3, 5),
      });
      expect(next.phase).toBe("PROPOSAL");
      expect(next.currentProposal).toBeNull();
      expect(next.currentVoteResult).toBeNull();
      expect(next.consecutiveRejections).toBe(2);
    });

    it("連續 5 次否決：奧客獲勝，提案與票數清除", () => {
      const next = resolveCurrentProposalVote({
        ...voting(4),
        currentVoteResult: createProposalVoteResult(2, 6),
      });
      expect(next.phase).toBe("FINISHED");
      expect(next.endResult?.reason).toBe("EVIL_REJECTIONS");
      expect(next.currentProposal).toBeNull();
      expect(next.currentVoteResult).toBeNull();
    });

    it("沒有票數時仍原樣回傳", () => {
      const state: GameState = { ...voting(), currentVoteResult: null };
      expect(resolveCurrentProposalVote(state)).toBe(state);
    });
  });

  it("回歸：直接結算後，下一個提案不會被上一輪票數自動結算", () => {
    let state: GameState = { ...createInitialGameState(8), phase: "PROPOSAL" };
    state = submitProposal(state, proposal);
    state = setProposalVoteResult(state, createProposalVoteResult(5, 3));
    state = resolveProposalVote(state, true);
    expect(state.phase).toBe("MISSION");
    state = submitMissionResult(state, createMissionInput(0, 8));
    expect(state.phase).toBe("PROPOSAL");
    state = submitProposal(state, createProposal("p9", ["p9", "p8"]));
    expect(state.phase).toBe("VOTING");
    expect(state.currentVoteResult).toBeNull();
    expect(resolveCurrentProposalVote(state)).toBe(state);
  });
});

describe("round（目前任務輪次）", () => {
  const proposal = createProposal("p1", ["p1", "p2"]);
  /** 走完一輪提案流程：提交提案、設定票數、結算。 */
  const vote = (state: GameState, approve: number, reject: number): GameState =>
    resolveCurrentProposalVote(
      setProposalVoteResult(submitProposal(state, proposal), createProposalVoteResult(approve, reject)),
    );

  it("初始輪次為 1（各種合法人數都一致）", () => {
    for (const count of [MIN_PLAYERS, 9, MAX_PLAYERS]) {
      expect(createInitialGameState(count).round).toBe(1);
    }
  });

  it("開始遊戲、提交提案、設定票數都不改變輪次", () => {
    const started = startGame(createInitialGameState(8));
    expect(started.round).toBe(1);
    const proposed = submitProposal(started, proposal);
    expect(proposed.round).toBe(1);
    expect(setProposalVoteResult(proposed, createProposalVoteResult(5, 3)).round).toBe(1);
  });

  it("提案被否決（含平票）時輪次不變，回到 PROPOSAL", () => {
    let state = startGame(createInitialGameState(8));
    state = vote(state, 3, 5);
    expect(state.phase).toBe("PROPOSAL");
    expect(state.round).toBe(1);
    state = vote(state, 4, 4);
    expect(state.phase).toBe("PROPOSAL");
    expect(state.consecutiveRejections).toBe(2);
    expect(state.round).toBe(1);
  });

  it("resolveProposalVote 直接呼叫時，否決也不改變輪次", () => {
    const voting: GameState = { ...createInitialGameState(8), phase: "VOTING", round: 3, currentProposal: proposal };
    expect(resolveProposalVote(voting, false).round).toBe(3);
    expect(resolveProposalVote(voting, true).round).toBe(3);
  });

  it("連續 5 次否決結束遊戲：輪次不變", () => {
    let state = startGame(createInitialGameState(8));
    for (let i = 0; i < 5; i++) state = vote(state, 2, 6);
    expect(state.phase).toBe("FINISHED");
    expect(state.round).toBe(1);
  });

  it("提案通過進入 MISSION：輪次不變", () => {
    const state = vote(startGame(createInitialGameState(8)), 5, 3);
    expect(state.phase).toBe("MISSION");
    expect(state.round).toBe(1);
  });

  it("任務結算後回到 PROPOSAL（成功或失敗）：輪次加 1", () => {
    let state = vote(startGame(createInitialGameState(8)), 5, 3);
    state = submitMissionResult(state, createMissionInput(0, 8));
    expect(state.phase).toBe("PROPOSAL");
    expect(state.round).toBe(2);
    state = vote(state, 5, 3);
    state = submitMissionResult(state, createMissionInput(1, 8));
    expect(state.phase).toBe("PROPOSAL");
    expect(state.successfulMissions).toBe(1);
    expect(state.round).toBe(3);
  });

  it("否決穿插在任務之間，不會多算輪次", () => {
    let state = startGame(createInitialGameState(8));
    state = vote(state, 5, 3);
    state = submitMissionResult(state, createMissionInput(0, 8)); // 第 1 輪結束
    state = vote(state, 2, 6);
    state = vote(state, 2, 6);
    state = vote(state, 2, 6); // 三次否決
    expect(state.round).toBe(2);
    state = vote(state, 5, 3);
    state = submitMissionResult(state, createMissionInput(0, 8)); // 第 2 輪結束
    expect(state.round).toBe(3);
  });

  it("進入 REPORT 或 FINISHED 時輪次不再增加", () => {
    const toReport: GameState = { ...createInitialGameState(8), phase: "MISSION", round: 3, successfulMissions: 2 };
    expect(submitMissionResult(toReport, createMissionInput(0, 8)).round).toBe(3);
    const toFinished: GameState = { ...createInitialGameState(8), phase: "MISSION", round: 2, totalComplaintCards: 2 };
    expect(submitMissionResult(toFinished, createMissionInput(1, 8)).round).toBe(2);
  });

  it("整合：由流程走到第 4 輪，8 人局 1 張客訴卡任務成功，7 人局則失敗", () => {
    const play = (players: number): GameState => {
      let state = startGame(createInitialGameState(players));
      const cardsPerRound = [1, 0, 0]; // 第 1 輪失敗，第 2、3 輪成功
      for (const cards of cardsPerRound) {
        state = vote(state, players, 0);
        state = submitMissionResult(state, createMissionInput(cards, players));
      }
      expect(state.round).toBe(4);
      expect(state.phase).toBe("PROPOSAL");
      state = vote(state, players, 0);
      return submitMissionResult(state, createMissionInput(1, players));
    };
    const eight = play(8);
    expect(eight.successfulMissions).toBe(3);
    expect(eight.totalComplaintCards).toBe(2);
    expect(eight.phase).toBe("REPORT");
    expect(eight.round).toBe(4);
    const seven = play(7);
    expect(seven.successfulMissions).toBe(2);
    expect(seven.totalComplaintCards).toBe(2);
    expect(seven.phase).toBe("PROPOSAL");
    expect(seven.round).toBe(5);
  });

  it("不修改原始 state", () => {
    const state: GameState = { ...createInitialGameState(8), phase: "MISSION", round: 2, currentProposal: proposal };
    const before = structuredClone(state);
    submitMissionResult(state, createMissionInput(0, 8));
    expect(state).toEqual(before);
    expect(state.round).toBe(2);
  });
});

describe("submitMissionResult：任務玩家人數以 state.playerCount 為準", () => {
  const missionState = (playerCount: number, round: number, extra: Partial<GameState> = {}): GameState => ({
    ...createInitialGameState(playerCount),
    phase: "MISSION",
    round,
    successfulMissions: 1,
    ...extra,
  });

  it("8 人局第 4 輪 1 張客訴卡：任務成功（輸入寫成 6 人也一樣）", () => {
    const next = submitMissionResult(missionState(8, 4), createMissionInput(1, 6));
    expect(next.successfulMissions).toBe(2);
    expect(next.totalComplaintCards).toBe(1);
    expect(next.phase).toBe("PROPOSAL");
    expect(next.round).toBe(5);
  });

  it("8 人局第 4 輪 1 張客訴卡：輸入人數不論是 7 或 12，結果都相同", () => {
    for (const inputPlayers of [7, 8, 12, 0, Number.NaN]) {
      const next = submitMissionResult(missionState(8, 4), createMissionInput(1, inputPlayers));
      expect(next.successfulMissions).toBe(2);
    }
  });

  it("7 人局第 4 輪 1 張客訴卡：任務失敗（輸入寫成 8 人也一樣）", () => {
    const next = submitMissionResult(missionState(7, 4), createMissionInput(1, 8));
    expect(next.successfulMissions).toBe(1);
    expect(next.totalComplaintCards).toBe(1);
    expect(next.round).toBe(5);
  });

  it("6 人局第 4 輪 1 張客訴卡：任務失敗（輸入寫成 12 人也一樣）", () => {
    const next = submitMissionResult(missionState(6, 4), createMissionInput(1, 12));
    expect(next.successfulMissions).toBe(1);
  });

  it("8 人局第 4 輪 2 張客訴卡：任務失敗（輸入寫成 6 人也一樣）", () => {
    const next = submitMissionResult(missionState(8, 4), createMissionInput(2, 6));
    expect(next.successfulMissions).toBe(1);
    expect(next.totalComplaintCards).toBe(2);
  });

  it("8 人局其他輪次 1 張客訴卡仍然失敗（輸入寫成 6 人也一樣）", () => {
    for (const round of [1, 2, 3, 5]) {
      const next = submitMissionResult(missionState(8, round), createMissionInput(1, 6));
      expect(next.successfulMissions).toBe(1);
    }
  });

  it("既有規則不變：第 4 輪 1 張客訴卡，8 人以上成功、未滿 8 人失敗（輸入與狀態一致）", () => {
    for (const players of [6, 7, 8, 9, 10, 11, 12]) {
      const next = submitMissionResult(missionState(players, 4), createMissionInput(1, players));
      expect(next.successfulMissions).toBe(players >= 8 ? 2 : 1);
    }
  });

  it("既有規則不變：0 張客訴卡一律成功", () => {
    for (const players of [6, 8, 12]) {
      for (const round of [1, 4]) {
        const next = submitMissionResult(missionState(players, round), createMissionInput(0, players));
        expect(next.successfulMissions).toBe(2);
      }
    }
  });

  it("結果與 resolveMission(card, state.playerCount, state.round) + resolveMissionResult 一致", () => {
    for (const [statePlayers, inputPlayers, round, cards] of [
      [8, 6, 4, 1],
      [7, 8, 4, 1],
      [8, 12, 4, 2],
      [6, 12, 3, 1],
    ] as const) {
      const state = missionState(statePlayers, round);
      expect(submitMissionResult(state, createMissionInput(cards, inputPlayers))).toEqual(
        resolveMissionResult(state, resolveMission(cards, statePlayers, round)),
      );
    }
  });

  it("勝負優先順序不變：第 3 次成功同時累積第 3 張客訴卡，奧客勝利優先", () => {
    const state = missionState(8, 4, { successfulMissions: 2, totalComplaintCards: 2 });
    const next = submitMissionResult(state, createMissionInput(1, 6));
    expect(next.successfulMissions).toBe(3);
    expect(next.totalComplaintCards).toBe(3);
    expect(next.phase).toBe("FINISHED");
    expect(next.endResult?.reason).toBe("EVIL_COMPLAINT_CARDS");
  });

  it("不修改原始 state 與 missionInput（深拷貝比對）", () => {
    const state = missionState(8, 4, { currentProposal: createProposal("p1", ["p1", "p2"]) });
    const input = createMissionInput(1, 6);
    const stateBefore = structuredClone(state);
    const inputBefore = structuredClone(input);
    const next = submitMissionResult(state, input);
    expect(state).toEqual(stateBefore);
    expect(input).toEqual(inputBefore);
    expect(state.playerCount).toBe(8);
    expect(next).not.toBe(state);
  });
});
