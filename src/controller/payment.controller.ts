import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import {
  initiatePayuPayment,
  processPayuCallback,
  verifyPaymentWithPayU,
  generateAutoSubmitCheckoutHtml,
  generateResultHtml,
  generateSdkHash,
} from "../services/payu.service";
import { PaymentTransactionModel } from "../models/PaymentTransaction";
import { UserModel } from "../models/User";

/**
 * Initiates a new PayU payment transaction.
 * POST /payments/initiate
 */
export async function initiatePaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { planId, phone, email, name } = req.body ?? {};
    if (!planId) {
      res.status(400).json({ success: false, message: "planId is required" });
      return;
    }

    const result = await initiatePayuPayment({
      userId,
      planId: String(planId),
      phone: phone ? String(phone) : undefined,
      email: email ? String(email) : undefined,
      name: name ? String(name) : undefined,
    });

    res.status(200).json({
      success: true,
      message: "PayU payment order initiated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dynamic hash generation for PayU CheckoutPro Flutter SDK (payu_checkoutpro_flutter).
 * POST /payments/payu/generate-hash
 */
export async function generateHashHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      hashName,
      hashString,
      hashType,
      postSalt,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    } = req.body ?? {};

    const effectiveHashName = (hashName ? String(hashName) : "payment_hash").trim();

    // Guard: dynamic SDK hashes require hashString from PayU SDK
    if (effectiveHashName !== "payment_hash" && (typeof hashString !== "string" || !hashString)) {
      res.status(400).json({
        success: false,
        message: `hashString is required for dynamic hash '${effectiveHashName}'`,
      });
      return;
    }

    const hash = generateSdkHash({
      hashName: effectiveHashName,
      hashString,
      hashType,
      postSalt,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    });

    // Safe diagnostic logging (never prints salt, secret, or full hash)
    console.log(
      `[PayU Hash] Generated: name=${effectiveHashName}, type=${hashType || "V1"}, strLen=${hashString ? hashString.length : 0}, hasPostSalt=${Boolean(postSalt)}, hashLen=${hash.length}`,
    );

    res.status(200).json({
      success: true,
      data: {
        hashName: effectiveHashName,
        hash,
        hashType:
          hashType ||
          (effectiveHashName === "mcpLookup"
            ? "HMAC-SHA1"
            : ["get_all_offer_details", "get_checkout_details"].includes(effectiveHashName)
            ? "V2"
            : "V1"),
      },
      [effectiveHashName]: hash,
      hash,
    });
  } catch (error: any) {
    console.error(`[PayU Hash Error] ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to generate PayU hash",
    });
  }
}

/**
 * Renders an auto-submitting HTML form for WebView / Browser checkout.
 * GET /payments/payu/checkout/:txnid
 */
export async function renderCheckoutPageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { txnid } = req.params;
    const transaction = await PaymentTransactionModel.findOne({ txnid }).lean();

    if (!transaction) {
      res.status(404).send("Transaction not found or expired.");
      return;
    }

    if (transaction.status === "success") {
      res.send(
        generateResultHtml({
          success: true,
          title: "Payment Already Completed",
          txnid: transaction.txnid,
          amount: transaction.amount,
          planTitle: transaction.planTitle,
          message: "This payment has already been verified and processed.",
        }),
      );
      return;
    }

    const actionUrl = `${env.payu.baseUrl}/_payment`;
    const html = generateAutoSubmitCheckoutHtml(
      transaction.requestPayload,
      actionUrl,
    );
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles PayU success POST callback (surl).
 * POST /payments/payu/success
 */
export async function payuSuccessCallbackHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const payload = req.body ?? {};
    const result = await processPayuCallback(payload);

    res.setHeader("Content-Type", "text/html");
    res.send(
      generateResultHtml({
        success: true,
        title: "Payment Successful!",
        txnid: result.transaction.txnid,
        amount: result.amount,
        planTitle: result.planTitle,
        message:
          "Thank you! Your subscription is now active. Enjoy premium features on Vellora.",
      }),
    );
  } catch (error: any) {
    const txnid = String(req.body?.txnid || "N/A");
    res.setHeader("Content-Type", "text/html");
    res.status(400).send(
      generateResultHtml({
        success: false,
        title: "Verification Failed",
        txnid,
        amount: Number(req.body?.amount || 0),
        planTitle: String(req.body?.productinfo || "Subscription Plan"),
        message: error.message || "Payment verification failed",
      }),
    );
  }
}

/**
 * Handles PayU failure / cancel POST callback (furl).
 * POST /payments/payu/failure
 */
export async function payuFailureCallbackHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const payload = req.body ?? {};
    const result = await processPayuCallback(payload).catch((err) => ({
      success: false,
      transaction: { txnid: payload.txnid, amount: Number(payload.amount || 0), planTitle: payload.productinfo || "Plan" },
      amount: Number(payload.amount || 0),
      planTitle: String(payload.productinfo || "Subscription Plan"),
      errorMessage: err.message,
    }));

    res.setHeader("Content-Type", "text/html");
    res.send(
      generateResultHtml({
        success: false,
        title: "Payment Failed",
        txnid: String(payload.txnid || "N/A"),
        amount: Number(payload.amount || 0),
        planTitle: String(payload.productinfo || "Subscription Plan"),
        message:
          result.errorMessage ||
          payload.error_Message ||
          "Your transaction could not be completed. Please try again.",
      }),
    );
  } catch (error: any) {
    res.setHeader("Content-Type", "text/html");
    res.status(400).send(
      generateResultHtml({
        success: false,
        title: "Payment Cancelled / Failed",
        txnid: String(req.body?.txnid || "N/A"),
        amount: Number(req.body?.amount || 0),
        planTitle: String(req.body?.productinfo || "Subscription Plan"),
        message: error.message || "Payment failed or was cancelled.",
      }),
    );
  }
}

/**
 * S2S verification endpoint (explicit check with PayU server).
 * POST /payments/verify
 */
export async function verifyPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { txnid } = req.body ?? {};
    if (!txnid) {
      res.status(400).json({ success: false, message: "txnid is required" });
      return;
    }

    const result = await verifyPaymentWithPayU(String(txnid));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Checks transaction status for client polling.
 * GET /payments/status/:txnid
 */
export async function getPaymentStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { txnid } = req.params;
    const transaction = await PaymentTransactionModel.findOne({ txnid }).lean();

    if (!transaction) {
      res.status(404).json({ success: false, message: "Transaction not found" });
      return;
    }

    const user = await UserModel.findById(transaction.userId).lean();

    res.status(200).json({
      success: true,
      data: {
        txnid: transaction.txnid,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        planTitle: transaction.planTitle,
        isUserPremium: Boolean(user?.isPremium),
        premiumExpiresAt: user?.premiumExpiresAt,
        createdAt: transaction.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Gets payment history of the authenticated user.
 * GET /payments/history
 */
export async function getUserPaymentHistoryHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.user?.sub;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const transactions = await PaymentTransactionModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: transactions.map((t) => ({
        id: String(t._id),
        txnid: t.txnid,
        planTitle: t.planTitle,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        mode: t.mode,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: List all transactions with pagination and metrics.
 * GET /admin/payments
 */
export async function adminListPaymentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const status = req.query.status ? String(req.query.status) : undefined;

    const filter: Record<string, any> = {};
    if (status) filter.status = status;

    const [items, total, totalRevenueAgg] = await Promise.all([
      PaymentTransactionModel.find(filter)
        .populate("userId", "name profile publicUserId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PaymentTransactionModel.countDocuments(filter),
      PaymentTransactionModel.aggregate([
        { $match: { status: "success" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: {
        items: items.map((t: any) => ({
          id: String(t._id),
          txnid: t.txnid,
          userName: t.userId?.name || t.customer?.name || "Unknown",
          userEmail: t.userId?.profile || t.customer?.email || "",
          planTitle: t.planTitle,
          amount: t.amount,
          currency: t.currency,
          status: t.status,
          payuPaymentId: t.payuPaymentId,
          bankRefNum: t.bankRefNum,
          mode: t.mode,
          createdAt: t.createdAt,
        })),
        metrics: {
          totalTransactions: total,
          totalRevenue,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
