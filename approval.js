const fs = require("fs");
const path = require("path");

const APPROVAL_FILE = path.join(__dirname, "approvals.json");
const RULES_FILE = path.join(__dirname, "rules.json");

function getRules() {
  return JSON.parse(fs.readFileSync(RULES_FILE, "utf8"));
}

function loadApprovals() {
  if (!fs.existsSync(APPROVAL_FILE)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(APPROVAL_FILE, "utf8"));
}

function saveApprovals(approvals) {
  fs.writeFileSync(
    APPROVAL_FILE,
    JSON.stringify(approvals, null, 2),
    "utf8"
  );
}

function checkApproval(action) {
  const rules = getRules();

  if (!action || !action.type) {
    return {
      approved: false,
      requires_approval: false,
      reason: "Action type is required"
    };
  }

  // Deletion is permanently disabled
  if (action.type === "delete") {
    return {
      approved: false,
      requires_approval: false,
      reason: "Deletion is permanently disabled"
    };
  }

  // Budget changes
  if (action.type === "budget_change") {
    const current = Number(action.current_daily_budget);
    const proposed = Number(action.proposed_daily_budget);

    if (!Number.isFinite(current) || !Number.isFinite(proposed)) {
      return {
        approved: false,
        requires_approval: true,
        reason: "Valid current and proposed budgets are required"
      };
    }

    if (proposed > rules.budget.max_daily_budget) {
      return {
        approved: false,
        requires_approval: true,
        reason: `Proposed budget exceeds maximum daily budget of ${rules.budget.max_daily_budget}`
      };
    }

    const increasePercent =
      current > 0 ? ((proposed - current) / current) * 100 : 0;

    if (increasePercent > rules.budget.max_budget_increase_percent) {
      return {
        approved: false,
        requires_approval: true,
        reason: `Budget increase exceeds allowed ${rules.budget.max_budget_increase_percent}%`
      };
    }

    if (rules.automation.allow_automatic_budget_changes === true) {
      return {
        approved: true,
        requires_approval: false,
        reason: "Automatic budget change is allowed"
      };
    }

    return {
      approved: false,
      requires_approval: true,
      reason: "Budget changes require human approval"
    };
  }

  // Campaign creation
  if (action.type === "campaign_creation") {
    if (rules.campaign.require_approval_for_creation) {
      return {
        approved: false,
        requires_approval: true,
        reason: "Campaign creation requires human approval"
      };
    }

    return {
      approved: true,
      requires_approval: false,
      reason: "Campaign creation is allowed"
    };
  }

  // New creative
  if (action.type === "creative_creation") {
    if (rules.creative.require_approval_for_new_creatives) {
      return {
        approved: false,
        requires_approval: true,
        reason: "New creatives require human approval"
      };
    }

    return {
      approved: true,
      requires_approval: false,
      reason: "New creative creation is allowed"
    };
  }

  // Targeting changes
  if (action.type === "targeting_change") {
    if (rules.targeting.require_approval_for_targeting_changes) {
      return {
        approved: false,
        requires_approval: true,
        reason: "Targeting changes require human approval"
      };
    }

    return {
      approved: true,
      requires_approval: false,
      reason: "Targeting change is allowed"
    };
  }

  // Major changes
  if (rules.approval.require_approval_for_major_changes) {
    return {
      approved: false,
      requires_approval: true,
      reason: "Major changes require human approval"
    };
  }

  return {
    approved: true,
    requires_approval: false,
    reason: "Action is allowed by current rules"
  };
}

function createApproval(action, reason = "") {
  const approvals = loadApprovals();

  const approvalCheck = checkApproval(action);

  const approval = {
    id: `APR-${Date.now()}`,
    status: approvalCheck.requires_approval ? "PENDING" : "APPROVED",
    created_at: new Date().toISOString(),
    action,
    reason: reason || approvalCheck.reason,
    approval: approvalCheck,
    decided_at: approvalCheck.requires_approval ? null : new Date().toISOString()
  };

  approvals.push(approval);
  saveApprovals(approvals);

  return approval;
}

function getApproval(id) {
  const approvals = loadApprovals();

  return approvals.find((item) => item.id === id) || null;
}

function listApprovals() {
  return loadApprovals();
}

function approveApproval(id) {
  const approvals = loadApprovals();

  const approval = approvals.find((item) => item.id === id);

  if (!approval) {
    return null;
  }

  if (approval.status !== "PENDING") {
    return approval;
  }

  approval.status = "APPROVED";
  approval.decided_at = new Date().toISOString();

  saveApprovals(approvals);

  return approval;
}

function rejectApproval(id, reason = "Rejected by user") {
  const approvals = loadApprovals();

  const approval = approvals.find((item) => item.id === id);

  if (!approval) {
    return null;
  }

  if (approval.status !== "PENDING") {
    return approval;
  }

  approval.status = "REJECTED";
  approval.rejection_reason = reason;
  approval.decided_at = new Date().toISOString();

  saveApprovals(approvals);

  return approval;
}

module.exports = {
  checkApproval,
  createApproval,
  getApproval,
  listApprovals,
  approveApproval,
  rejectApproval
};
