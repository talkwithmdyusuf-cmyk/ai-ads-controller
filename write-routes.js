function registerWriteRoutes({
  app,
  authenticate,
  metaGet,
  metaPost,
  protectAction,
  createApproval,
  META_AD_ACCOUNT_ID
}) {

  function errorResponse(reply, error) {
    return reply.code(400).send({
      success: false,
      error: error.response?.data || error.message
    });
  }

  async function executeAction(action) {

    let result;

    // -----------------------------
    // CAMPAIGN CREATE
    // -----------------------------
    if (action.type === "campaign_creation") {

      const data = {
        name: action.name,
        objective: action.objective,
        status: "PAUSED",
        daily_budget: Math.round(
          Number(action.daily_budget_rupees) * 100
        ),
        special_ad_categories: JSON.stringify(
          action.special_ad_categories || []
        )
      };

      if (action.bid_strategy) {
        data.bid_strategy = action.bid_strategy;
      }

      result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/campaigns`,
        data
      );
    }

    // -----------------------------
    // CAMPAIGN UPDATE
    // -----------------------------
    else if (action.type === "campaign_update") {

      result = await metaPost(
        `/${action.campaign_id}`,
        action.data
      );
    }

    // -----------------------------
    // CAMPAIGN DUPLICATE
    // -----------------------------
    else if (action.type === "campaign_duplication") {

      const source = await metaGet(
        `/${action.campaign_id}`,
        {
          fields:
            "name,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,special_ad_categories"
        }
      );

      const data = {
        name: action.new_name ||
          `${source.name} - Copy`,
        objective: source.objective,
        status: "PAUSED"
      };

      if (source.buying_type) {
        data.buying_type = source.buying_type;
      }

      if (source.bid_strategy) {
        data.bid_strategy = source.bid_strategy;
      }

      if (source.daily_budget) {
        data.daily_budget = source.daily_budget;
      }

      if (source.lifetime_budget) {
        data.lifetime_budget = source.lifetime_budget;
      }

      if (source.special_ad_categories) {
        data.special_ad_categories =
          JSON.stringify(source.special_ad_categories);
      }

      result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/campaigns`,
        data
      );
    }

    // -----------------------------
    // AD SET CREATE
    // -----------------------------
    else if (action.type === "adset_creation") {

      const data = {
        campaign_id: action.campaign_id,
        name: action.name,
        status: "PAUSED",
        billing_event: action.billing_event,
        optimization_goal: action.optimization_goal,
        targeting: JSON.stringify(action.targeting)
      };

      if (action.daily_budget_rupees !== undefined) {
        data.daily_budget = Math.round(
          Number(action.daily_budget_rupees) * 100
        );
      }

      if (action.bid_strategy) {
        data.bid_strategy = action.bid_strategy;
      }

      if (action.bid_amount !== undefined) {
        data.bid_amount = action.bid_amount;
      }

      result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/adsets`,
        data
      );
    }

    // -----------------------------
    // AD SET UPDATE / TARGETING
    // -----------------------------
    else if (
      action.type === "adset_update" ||
      action.type === "targeting_change"
    ) {

      result = await metaPost(
        `/${action.adset_id}`,
        action.data
      );
    }

    // -----------------------------
    // AD SET DUPLICATE
    // -----------------------------
    else if (action.type === "adset_duplication") {

      const source = await metaGet(
        `/${action.adset_id}`,
        {
          fields:
            "name,campaign_id,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,targeting"
        }
      );

      const data = {
        campaign_id:
          action.destination_campaign_id ||
          source.campaign_id,

        name:
          action.new_name ||
          `${source.name} - Copy`,

        optimization_goal:
          source.optimization_goal,

        billing_event:
          source.billing_event,

        targeting:
          JSON.stringify(source.targeting),

        status: "PAUSED"
      };

      if (source.bid_strategy) {
        data.bid_strategy = source.bid_strategy;
      }

      if (source.bid_amount !== undefined) {
        data.bid_amount = source.bid_amount;
      }

      if (source.daily_budget !== undefined) {
        data.daily_budget = source.daily_budget;
      }

      result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/adsets`,
        data
      );
    }

    // -----------------------------
    // AD CREATE
    // -----------------------------
    else if (action.type === "ad_creation") {

      const data = {
        name: action.name,
        status: "PAUSED",
        adset_id: action.adset_id,
        creative: JSON.stringify(action.creative)
      };

      result = await metaPost(
        `/${META_AD_ACCOUNT_ID}/ads`,
        data
      );
    }

    // -----------------------------
    // AD UPDATE
    // -----------------------------
    else if (action.type === "ad_update") {

      result = await metaPost(
        `/${action.ad_id}`,
        action.data
      );
    }

    // -----------------------------
    // AD DUPLICATE
    // -----------------------------
    else if (action.type === "ad_duplication") {

      result = await metaPost(
        `/${action.ad_id}/copies`,
        {
          status_option: "PAUSED",
          rename_options: JSON.stringify({
            rename_strategy: "ONLY_TOP_LEVEL_RENAME"
          })
        }
      );
    }

    // -----------------------------
    // BUDGET CHANGE
    // -----------------------------
    else if (action.type === "budget_change") {

      const targetId =
        action.campaign_id ||
        action.adset_id;

      result = await metaPost(
        `/${targetId}`,
        {
          daily_budget: Math.round(
            Number(action.proposed_daily_budget) * 100
          )
        }
      );
    }

    // -----------------------------
    // PAUSE / RESUME
    // -----------------------------
    else if (
      action.type === "campaign_pause" ||
      action.type === "campaign_resume"
    ) {

      result = await metaPost(
        `/${action.campaign_id}`,
        {
          status:
            action.type === "campaign_pause"
              ? "PAUSED"
              : "ACTIVE"
        }
      );
    }

    else if (
      action.type === "adset_pause" ||
      action.type === "adset_resume"
    ) {

      result = await metaPost(
        `/${action.adset_id}`,
        {
          status:
            action.type === "adset_pause"
              ? "PAUSED"
              : "ACTIVE"
        }
      );
    }

    else if (
      action.type === "ad_pause" ||
      action.type === "ad_resume"
    ) {

      result = await metaPost(
        `/${action.ad_id}`,
        {
          status:
            action.type === "ad_pause"
              ? "PAUSED"
              : "ACTIVE"
        }
      );
    }

    else {
      throw new Error(
        `Unsupported action type: ${action.type}`
      );
    }

    return result;
  }

  // ==================================================
  // GENERIC ACTION REQUEST
  // ==================================================

  async function requestAction(request, reply) {

    try {

      const action = {
        ...(request.body || {})
      };

      if (!action.type) {
        return reply.code(400).send({
          success: false,
          error: "Action type is required"
        });
      }

      if (action.type === "delete") {
        return reply.code(403).send({
          success: false,
          error: "Deletion is permanently disabled"
        });
      }

      const protection =
        await protectAction(action);

      if (!protection.allowed) {

         if (protection.approval_required) {

            const approval = createApproval(action);

             return reply.code(202).send({
                success: false,
                approval_required: true,
                approval
              });

             }

  return reply.code(403).send({
    success: false,
    ...protection
  });
}
      const result =
        await executeAction(action);

      return {
        success: true,
        executed: true,
        action,
        meta_result: result
      };

    } catch (error) {

      return errorResponse(reply, error);
    }
  }

  // ==================================================
  // CREATE / UPDATE / DUPLICATE ENDPOINTS
  // ==================================================

  app.post(
    "/meta/actions",
    { preHandler: authenticate },
    requestAction
  );

  // ==================================================
  // APPROVED ACTION EXECUTOR V2
  // ==================================================

  app.post(
    "/approvals/:id/execute-v2",
    { preHandler: authenticate },
    async (request, reply) => {

      try {

        const approval =
          require("./approval").getApproval(
            request.params.id
          );

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

        const result =
          await executeAction(approval.action);

        return {
          success: true,
          executed: true,
          approval_id: approval.id,
          action: approval.action,
          meta_result: result
        };

      } catch (error) {

        return errorResponse(reply, error);
      }
    }
  );
}

module.exports = {
  registerWriteRoutes
};
