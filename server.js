require("dotenv").config();
const { registerWriteRoutes } = require("./write-routes");
const Fastify = require("fastify");
const axios = require("axios");

const {
  checkApproval,
  createApproval,
  getApproval,
  listApprovals,
  approveApproval,
  rejectApproval
} = require("./approval");

const app = Fastify({
  logger: true
});

const PORT = process.env.PORT || 3000;
const META_API_VERSION = "v26.0";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const SERVER_API_KEY = process.env.SERVER_API_KEY;

if (!META_ACCESS_TOKEN) {
  console.error("❌ META_ACCESS_TOKEN missing in .env");
  process.exit(1);
}

if (!META_AD_ACCOUNT_ID) {
  console.error("❌ META_AD_ACCOUNT_ID missing in .env");
  process.exit(1);
}

if (!SERVER_API_KEY) {
  console.error("❌ SERVER_API_KEY missing in .env");
  process.exit(1);
}

const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// --------------------------------------------------
// SECURITY
// --------------------------------------------------

function authenticate(request, reply) {
  const auth = request.headers.authorization || "";

  if (auth !== `Bearer ${SERVER_API_KEY}`) {
    return reply.code(401).send({
      success: false,
      error: "Unauthorized"
    });
  }
}

async function metaGet(path, params = {}) {
  const response = await axios.get(`${META_BASE}${path}`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      ...params
    }
  });

  return response.data;
}

async function metaPost(path, data = {}) {
  const response = await axios.post(
    `${META_BASE}${path}`,
    null,
    {
      params: {
        access_token: META_ACCESS_TOKEN,
        ...data
      }
    }
  );

  return response.data;
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health", async () => {
  return {
    success: true,
    service: "AI Ads Controller",
    status: "online",
    meta_api: META_API_VERSION
  };
});

// --------------------------------------------------
// ACCOUNT
// --------------------------------------------------

app.get(
  "/meta/account",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const data = await metaGet(`/${META_AD_ACCOUNT_ID}`, {
        fields: "id,name,account_status,currency,timezone_name,amount_spent"
      });

      return {
        success: true,
        account: data
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// CAMPAIGNS
// --------------------------------------------------

app.get(
  "/meta/campaigns",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const data = await metaGet(
        `/${META_AD_ACCOUNT_ID}/campaigns`,
        {
          fields:
            "id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,created_time,updated_time",
          limit: 100
        }
      );

      return {
        success: true,
        campaigns: data.data || [],
        paging: data.paging || null
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// CAMPAIGN INSIGHTS
// --------------------------------------------------

app.get(
  "/meta/campaigns/:id/insights",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const campaignId = request.params.id;

      const data = await metaGet(`/${campaignId}/insights`, {
        date_preset: request.query.date_preset || "last_30d",
        fields:
          "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type"
      });

      return {
        success: true,
        campaign_id: campaignId,
        insights: data.data || [],
        paging: data.paging || null
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// ACCOUNT INSIGHTS
// --------------------------------------------------

app.get(
  "/meta/insights",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const data = await metaGet(
        `/${META_AD_ACCOUNT_ID}/insights`,
        {
          date_preset: request.query.date_preset || "last_30d",
          level: request.query.level || "account",
          fields:
            "account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type"
        }
      );

      return {
        success: true,
        insights: data.data || [],
        paging: data.paging || null
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// AD SETS
// --------------------------------------------------

app.get(
  "/meta/adsets",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const data = await metaGet(
        `/${META_AD_ACCOUNT_ID}/adsets`,
        {
          fields:
            "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,created_time,updated_time",
          limit: 100
        }
      );

      return {
        success: true,
        adsets: data.data || [],
        paging: data.paging || null
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// ADS
// --------------------------------------------------

app.get(
  "/meta/ads",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const data = await metaGet(
        `/${META_AD_ACCOUNT_ID}/ads`,
        {
          fields:
            "id,name,status,effective_status,adset_id,campaign_id,creative,created_time,updated_time",
          limit: 100
        }
      );

      return {
        success: true,
        ads: data.data || [],
        paging: data.paging || null
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// RULE / APPROVAL HELPER
// --------------------------------------------------

async function protectAction(action) {
  const result = checkApproval(action);

  if (!result.approved && result.requires_approval) {
    const approval = createApproval(action);

    return {
      allowed: false,
      approval_required: true,
      approval
    };
  }

  if (!result.approved) {
    return {
      allowed: false,
      approval_required: false,
      reason: result.reason
    };
  }

  return {
    allowed: true
  };
}

// --------------------------------------------------
// GENERIC STATUS CHANGE
// --------------------------------------------------

async function changeStatus(type, id, status) {
  const action = {
    type: `${type}_${status === "PAUSED" ? "pause" : "resume"}`,
    [`${type}_id`]: id,
    status
  };

  const protection = await protectAction(action);

  if (!protection.allowed) {
    return protection;
  }

  const result = await metaPost(`/${id}`, {
    status
  });

  return {
    allowed: true,
    action,
    meta_result: result
  };
}

// --------------------------------------------------
// PAUSE / RESUME CAMPAIGN
// --------------------------------------------------

app.post(
  "/meta/campaigns/:id/pause",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "campaign",
        request.params.id,
        "PAUSED"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

app.post(
  "/meta/campaigns/:id/resume",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "campaign",
        request.params.id,
        "ACTIVE"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// PAUSE / RESUME AD SET
// --------------------------------------------------

app.post(
  "/meta/adsets/:id/pause",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "adset",
        request.params.id,
        "PAUSED"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

app.post(
  "/meta/adsets/:id/resume",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "adset",
        request.params.id,
        "ACTIVE"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// PAUSE / RESUME AD
// --------------------------------------------------

app.post(
  "/meta/ads/:id/pause",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "ad",
        request.params.id,
        "PAUSED"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

app.post(
  "/meta/ads/:id/resume",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = await changeStatus(
        "ad",
        request.params.id,
        "ACTIVE"
      );

      return reply.code(
        result.approval_required ? 202 : result.allowed ? 200 : 403
      ).send({
        success: result.allowed,
        ...result
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// BUDGET CHANGE
// --------------------------------------------------

app.post(
  "/meta/campaigns/:id/budget",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const campaignId = request.params.id;

      const amountRupees = Number(
        request.body?.daily_budget_rupees
      );

      if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
        return reply.code(400).send({
          success: false,
          error:
            "daily_budget_rupees must be a positive number"
        });
      }

      const action = {
        type: "budget_change",
        campaign_id: campaignId,
        current_daily_budget:
          request.body?.current_daily_budget,
        proposed_daily_budget: amountRupees,
        reason:
          request.body?.reason ||
          "Budget change requested by AI Ads Controller"
      };

      const protection = await protectAction(action);

      if (!protection.allowed) {
        return reply
          .code(protection.approval_required ? 202 : 403)
          .send({
            success: false,
            ...protection
          });
      }

      // Meta expects minor currency units.
      // Example: ₹1,000 = 100000 paise.
      const metaBudget = Math.round(amountRupees * 100);

      const result = await metaPost(`/${campaignId}`, {
        daily_budget: metaBudget
      });

      return {
        success: true,
        action,
        meta_daily_budget: metaBudget,
        meta_result: result
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);

// --------------------------------------------------
// APPROVALS
// --------------------------------------------------

app.post(
  "/approval/check",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = checkApproval(request.body);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/approval/request",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const action = request.body;

      const check = checkApproval(action);

      if (!check.requires_approval) {
        return {
          success: true,
          approval_required: false,
          check
        };
      }

      const approval = createApproval(action);

      return reply.code(202).send({
        success: true,
        approval_required: true,
        approval
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }
);

app.get(
  "/approvals",
  { preHandler: authenticate },
  async () => {
    return {
      success: true,
      approvals: listApprovals()
    };
  }
);

app.get(
  "/approvals/:id",
  { preHandler: authenticate },
  async (request, reply) => {
    const approval = getApproval(request.params.id);

    if (!approval) {
      return reply.code(404).send({
        success: false,
        error: "Approval not found"
      });
    }

    return {
      success: true,
      approval
    };
  }
);

app.post(
  "/approvals/:id/approve",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = approveApproval(request.params.id);

      return {
        success: true,
        approval: result
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/approvals/:id/reject",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const result = rejectApproval(request.params.id);

      return {
        success: true,
        approval: result
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.message
      });
    }
  }
);

// --------------------------------------------------
// EXECUTE APPROVED ACTION
// --------------------------------------------------

app.post(
  "/approvals/:id/execute",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const approval = getApproval(request.params.id);

      if (!approval) {
        return reply.code(404).send({
          success: false,
          error: "Approval not found"
        });
      }

      if (approval.status !== "APPROVED") {
        return reply.code(403).send({
          success: false,
          error: "Approval is not approved",
          status: approval.status
        });
      }

      const action = approval.action;

      let result;

      if (
        action.type === "budget_change"
      ) {
        const metaBudget = Math.round(
          Number(action.proposed_daily_budget) * 100
        );

        result = await metaPost(
          `/${action.campaign_id}`,
          {
            daily_budget: metaBudget
          }
        );
      }
      else if (
        action.type === "campaign_creation"
      ) {

        const metaData = {
          name: action.name,
          objective: action.objective,
          status: "PAUSED",
          daily_budget: Math.round(
            Number(action.daily_budget_rupees) * 100
          ),
          special_ad_categories: JSON.stringify(
            Array.isArray(action.special_ad_categories)
              ? action.special_ad_categories
              : []
          )
        };

        if (action.bid_strategy) {
          metaData.bid_strategy = action.bid_strategy;
        }

        result = await metaPost(
          `/${META_AD_ACCOUNT_ID}/campaigns`,
          metaData
        );
      }
      else if (
        action.type === "campaign_pause"
      ) {
        result = await metaPost(
          `/${action.campaign_id}`,
          { status: "PAUSED" }
        );
      }

      else if (
        action.type === "campaign_resume"
      ) {
        result = await metaPost(
          `/${action.campaign_id}`,
          { status: "ACTIVE" }
        );
      }

      else if (
        action.type === "adset_pause"
      ) {
        result = await metaPost(
          `/${action.adset_id}`,
          { status: "PAUSED" }
        );
      }

      else if (
        action.type === "adset_resume"
      ) {
        result = await metaPost(
          `/${action.adset_id}`,
          { status: "ACTIVE" }
        );
      }

      else if (
        action.type === "ad_pause"
      ) {
        result = await metaPost(
          `/${action.ad_id}`,
          { status: "PAUSED" }
        );
      }

      else if (
        action.type === "ad_resume"
      ) {
        result = await metaPost(
          `/${action.ad_id}`,
          { status: "ACTIVE" }
        );
      }

      else {
        return reply.code(400).send({
          success: false,
          error: `Unsupported approved action: ${action.type}`
        });
      }

      return {
        success: true,
        executed: true,
        action,
        meta_result: result
      };

    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);
// --------------------------------------------------
// CREATE CAMPAIGN
// --------------------------------------------------

app.post(
  "/meta/campaigns/create",
  { preHandler: authenticate },
  async (request, reply) => {
    try {
      const {
        name,
        objective,
        daily_budget_rupees,
        special_ad_categories = [],
        bid_strategy
      } = request.body || {};

      if (!name || typeof name !== "string") {
        return reply.code(400).send({
          success: false,
          error: "Campaign name is required"
        });
      }

      if (!objective || typeof objective !== "string") {
        return reply.code(400).send({
          success: false,
          error: "Campaign objective is required"
        });
      }

      const budget = Number(daily_budget_rupees);

      if (!Number.isFinite(budget) || budget <= 0) {
        return reply.code(400).send({
          success: false,
          error: "daily_budget_rupees must be a positive number"
        });
      }

      const action = {
        type: "campaign_creation",
        name,
        objective,
        daily_budget_rupees: budget,
        special_ad_categories,
        bid_strategy: bid_strategy || null,
        status: "PAUSED"
      };

      const protection = await protectAction(action);

      if (!protection.allowed) {
        return reply.code(
          protection.approval_required ? 202 : 403
        ).send({
          success: false,
          ...protection
        });
      }

      const metaData = {
        name,
        objective,
        status: "PAUSED",
        daily_budget: Math.round(budget * 100),
        special_ad_categories: JSON.stringify(
          Array.isArray(special_ad_categories)
            ? special_ad_categories
            : []
        )
      };

      if (bid_strategy) {
        metaData.bid_strategy = bid_strategy;
      }

      const result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/campaigns`,
        metaData
      );

      return {
        success: true,
        executed: true,
        action,
        meta_result: result
      };

    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
);
registerWriteRoutes({
  app,
  authenticate,
  metaGet,
  metaPost,
  protectAction,
  META_AD_ACCOUNT_ID
});
// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  reply.code(500).send({
    success: false,
    error: error.message
  });
});

// --------------------------------------------------
// START
// --------------------------------------------------

app.listen({
  port: PORT,
  host: "0.0.0.0"
})
  .then(() => {
    console.log("");
    console.log("🔥 AI ADS CONTROLLER ONLINE");
    console.log(`🚀 Port: ${PORT}`);
    console.log(`📡 Meta API: ${META_API_VERSION}`);
    console.log(`🎯 Account: ${META_AD_ACCOUNT_ID}`);
    console.log("🔐 API key protection: ON");
    console.log("🛡️ Approval system: ON");
    console.log("🚫 Deletion: BLOCKED");
    console.log("");
  })
  .catch((err) => {
    console.error("❌ SERVER START ERROR");
    console.error(err);
    process.exit(1);
  });
