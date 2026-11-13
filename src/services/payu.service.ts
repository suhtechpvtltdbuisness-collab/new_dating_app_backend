import crypto from "crypto";
import { env } from "../config/env";
import {
  PaymentTransactionModel,
  type PaymentStatus,
} from "../models/PaymentTransaction";
import { PlanModel } from "../models/Plan";
import { UserModel } from "../models/User";

export interface InitiatePaymentInput {
  userId: string;
  planId: string;
  phone?: string;
}

export interface PayUFormParams {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  hash: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
}

/**
 * Calculates plan duration in days from title / period.
 */
function calculatePlanDurationDays(title: string, period: string): number {
  const text = `${title} ${period}`.toLowerCase();
  if (text.includes("year") || text.includes("12 month")) return 365;
  if (text.includes("6 month")) return 180;
  if (text.includes("3 month")) return 90;
  if (text.includes("1 month") || text.includes("month")) return 30;
  if (text.includes("week") || text.includes("7 day")) return 7;
  return 30;
}

/**
 * Parses numeric amount from price strings like "₹99.99" or "99.99".
 */
function parseNumericPrice(priceRaw: string | number): number {
  if (typeof priceRaw === "number") return priceRaw;
  const cleaned = String(priceRaw).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? 99.99 : num;
}

/**
 * Generates PayU request sha512 hash:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
export function generatePayuRequestHash(params: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt: string;
}): string {
  const udf1 = params.udf1 ?? "";
  const udf2 = params.udf2 ?? "";
  const udf3 = params.udf3 ?? "";
  const udf4 = params.udf4 ?? "";
  const udf5 = params.udf5 ?? "";

  const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${params.salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

/**
 * Dynamic hash generation for PayU CheckoutPro SDK (payu_checkoutpro_flutter)
 * PayU SDK provides `hashString` without salt; backend appends salt and hashes.
 */
export function generateSdkHash(input: {
  hashName?: string;
  hashString?: string;
  txnid?: string;
  amount?: string;
  productinfo?: string;
  firstname?: string;
  email?: string;
  udf1?: string;
  udf2?: string;
}): string {
  if (input.hashString) {
    // If hashString already ends with salt or pipe, handle cleanly
    const raw = input.hashString.endsWith("|")
      ? `${input.hashString}${env.payu.salt}`
      : `${input.hashString}${env.payu.salt}`;
    return crypto.createHash("sha512").update(raw).digest("hex");
  }

  return generatePayuRequestHash({
    key: env.payu.key,
    txnid: input.txnid || "",
    amount: input.amount || "0.00",
    productinfo: input.productinfo || "",
    firstname: input.firstname || "",
    email: input.email || "",
    udf1: input.udf1 || "",
    udf2: input.udf2 || "",
    salt: env.payu.salt,
  });
}

/**
 * Verifies PayU response reverse sha512 hash:
 * Normal: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * If additionalCharges: sha512(additionalCharges|SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function verifyPayuResponseHash(
  payload: Record<string, any>,
  salt: string,
): boolean {
  const {
    key = "",
    txnid = "",
    amount = "",
    productinfo = "",
    firstname = "",
    email = "",
    status = "",
    udf1 = "",
    udf2 = "",
    udf3 = "",
    udf4 = "",
    udf5 = "",
    additionalCharges,
    hash: receivedHash = "",
  } = payload;

  let hashSequence = "";
  if (additionalCharges) {
    hashSequence = `${additionalCharges}|${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  } else {
    hashSequence = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  }

  const calculatedHash = crypto
    .createHash("sha512")
    .update(hashSequence)
    .digest("hex");

  return calculatedHash.toLowerCase() === String(receivedHash).toLowerCase();
}

/**
 * Initiates a PayU payment order and records it in MongoDB.
 */
export async function initiatePayuPayment(input: InitiatePaymentInput) {
  const user = await UserModel.findById(input.userId).lean();
  if (!user) throw new Error("User not found");

  const plan = await PlanModel.findById(input.planId).lean();
  if (!plan) throw new Error("Plan not found");
  if (!plan.isActive) throw new Error("This subscription plan is not active");

  const numericAmount = parseNumericPrice(plan.price);
  const amountFormatted = numericAmount.toFixed(2);

  // Generate unique transaction ID
  const txnid = `TXN_${Date.now()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  // Safe fallback values for PayU requirements
  const firstname = (user.name || "Customer").trim().split(" ")[0];
  const email = (user.profile || "customer@vellora.my").includes("@")
    ? (user.profile as string)
    : "customer@vellora.my";
  const phone = input.phone?.replace(/[^0-9]/g, "") || "9999999999";
  const productinfo = plan.title.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 50);

  const udf1 = String(user._id);
  const udf2 = String(plan._id);
  const udf3 = "vellora_subscription";
  const udf4 = "";
  const udf5 = "";

  const hash = generatePayuRequestHash({
    key: env.payu.key,
    txnid,
    amount: amountFormatted,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    salt: env.payu.salt,
  });

  const baseUrl = env.publicBaseUrl || `http://localhost:${env.port}`;
  const surl = `${baseUrl}/payments/payu/success`;
  const furl = `${baseUrl}/payments/payu/failure`;

  const params: PayUFormParams = {
    key: env.payu.key,
    txnid,
    amount: amountFormatted,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    hash,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
  };

  // Save pending transaction in database
  await PaymentTransactionModel.create({
    txnid,
    userId: user._id,
    planId: plan._id,
    planTitle: plan.title,
    amount: numericAmount,
    currency: "INR",
    status: "pending",
    paymentGateway: "payu",
    hash,
    customer: {
      name: user.name,
      email,
      phone,
    },
    requestPayload: params,
  });

  const actionUrl = `${env.payu.baseUrl}/_payment`;
  const checkoutUrl = `${baseUrl}/payments/payu/checkout/${txnid}`;

  return {
    txnid,
    amount: numericAmount,
    currency: "INR",
    planTitle: plan.title,
    actionUrl,
    checkoutUrl,
    params,
  };
}

/**
 * Handles PayU POST callbacks (both success and failure).
 */
export async function processPayuCallback(payload: Record<string, any>) {
  const txnid = String(payload.txnid || "").trim();
  const statusRaw = String(payload.status || "").toLowerCase();

  const transaction = await PaymentTransactionModel.findOne({ txnid });
  if (!transaction) {
    throw new Error(`Transaction ${txnid} not found in database`);
  }

  // Verify reverse hash
  const isHashValid = verifyPayuResponseHash(payload, env.payu.salt);
  if (!isHashValid) {
    transaction.status = "failure";
    transaction.errorMessage = "PayU signature hash mismatch verification failed";
    transaction.responsePayload = payload;
    await transaction.save();
    throw new Error("PayU payment response hash verification failed");
  }

  transaction.payuPaymentId = payload.mihpayid;
  transaction.bankRefNum = payload.bank_ref_num;
  transaction.mode = payload.mode;
  transaction.responsePayload = payload;
  transaction.verifiedAt = new Date();

  if (statusRaw === "success") {
    transaction.status = "success";
    transaction.errorMessage = "";
    await transaction.save();

    // Activate subscription for the user!
    const plan = await PlanModel.findById(transaction.planId).lean();
    const durationDays = plan
      ? calculatePlanDurationDays(plan.title, plan.period)
      : 30;

    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await UserModel.findByIdAndUpdate(transaction.userId, {
      $set: {
        isPremium: true,
        premiumPlanId: transaction.planId,
        premiumExpiresAt: expiresAt,
      },
    });

    return {
      success: true,
      status: "success" as PaymentStatus,
      transaction,
      planTitle: transaction.planTitle,
      amount: transaction.amount,
      expiresAt,
    };
  } else {
    transaction.status = "failure";
    transaction.errorMessage =
      payload.error_Message || payload.unmappedstatus || "Payment was not successful";
    await transaction.save();

    return {
      success: false,
      status: "failure" as PaymentStatus,
      transaction,
      planTitle: transaction.planTitle,
      amount: transaction.amount,
      errorMessage: transaction.errorMessage,
    };
  }
}

/**
 * Server-to-server verification via PayU verify_payment API.
 */
export async function verifyPaymentWithPayU(txnid: string) {
  const transaction = await PaymentTransactionModel.findOne({ txnid });
  if (!transaction) throw new Error("Transaction not found");

  const command = "verify_payment";
  const hashString = `${env.payu.key}|${command}|${txnid}|${env.payu.salt}`;
  const hash = crypto.createHash("sha512").update(hashString).digest("hex");

  const postserviceUrl = `${env.payu.baseUrl}/merchant/postservice?form=2`;
  const bodyParams = new URLSearchParams({
    key: env.payu.key,
    command,
    var1: txnid,
    hash,
  });

  const response = await fetch(postserviceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    throw new Error(`PayU postservice responded with HTTP ${response.status}`);
  }

  const json: any = await response.json();
  const txDetails = json?.transaction_details?.[txnid];

  if (txDetails && txDetails.status === "success") {
    transaction.status = "success";
    transaction.payuPaymentId = txDetails.mihpayid;
    transaction.bankRefNum = txDetails.bank_ref_num;
    transaction.mode = txDetails.mode;
    transaction.verifiedAt = new Date();
    await transaction.save();

    // Activate user plan
    const plan = await PlanModel.findById(transaction.planId).lean();
    const durationDays = plan
      ? calculatePlanDurationDays(plan.title, plan.period)
      : 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await UserModel.findByIdAndUpdate(transaction.userId, {
      $set: {
        isPremium: true,
        premiumPlanId: transaction.planId,
        premiumExpiresAt: expiresAt,
      },
    });

    return { success: true, status: "success", details: txDetails };
  }

  return { success: false, status: transaction.status, details: txDetails || json };
}

/**
 * Generates an auto-submitting HTML form to render in browser / WebView.
 */
export function generateAutoSubmitCheckoutHtml(params: PayUFormParams, actionUrl: string) {
  const fields = Object.entries(params)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}" />`,
    )
    .join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting to PayU Secure Payment...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #fafafa;
      color: #1a1a1a;
    }
    .card {
      background: #ffffff;
      padding: 32px;
      border-radius: 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      text-align: center;
      max-width: 380px;
      width: 90%;
    }
    .spinner {
      border: 3px solid rgba(255, 61, 119, 0.15);
      border-top-color: #FF3D77;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 { font-size: 18px; margin: 0 0 8px; color: #111; }
    p { font-size: 13px; color: #666; margin: 0 0 20px; line-height: 1.5; }
    .amount { font-size: 24px; font-weight: 800; color: #FF3D77; margin-bottom: 20px; }
    button {
      background: linear-gradient(135deg, #FF3D77, #8B2FC9);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Connecting to PayU...</h2>
    <p>Please do not refresh or close this window while we redirect you to the secure checkout.</p>
    <div class="amount">₹${params.amount}</div>
    <form id="payu_form" action="${actionUrl}" method="post">
      ${fields}
      <noscript>
        <button type="submit">Click here to continue to PayU &rarr;</button>
      </noscript>
    </form>
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      document.getElementById("payu_form").submit();
    });
  </script>
</body>
</html>`;
}

/**
 * Returns a clean success/failure status screen for WebView / browser.
 */
export function generateResultHtml(result: {
  success: boolean;
  title: string;
  txnid: string;
  amount: number;
  planTitle: string;
  message: string;
}) {
  const isSuccess = result.success;
  const themeColor = isSuccess ? "#10B981" : "#EF4444";
  const icon = isSuccess ? "✓" : "✕";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
    }
    .card {
      background: #ffffff;
      padding: 36px 28px;
      border-radius: 24px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.06);
      text-align: center;
      max-width: 400px;
      width: 90%;
    }
    .icon-badge {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${isSuccess ? "#ECFDF5" : "#FEF2F2"};
      color: ${themeColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 900;
      margin: 0 auto 20px;
    }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 8px; }
    p { font-size: 14px; color: #64748b; margin: 0 0 24px; line-height: 1.5; }
    .details {
      background: #f1f5f9;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
      font-size: 13px;
    }
    .row { display: flex; justify-content: space-between; padding: 6px 0; }
    .label { color: #64748b; }
    .val { font-weight: 700; color: #0f172a; }
    .btn {
      display: inline-block;
      width: 100%;
      box-sizing: border-box;
      padding: 14px 24px;
      border-radius: 50px;
      background: ${isSuccess ? "linear-gradient(135deg, #FF3D77, #8B2FC9)" : "#334155"};
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      border: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">${icon}</div>
    <h1>${result.title}</h1>
    <p>${result.message}</p>
    <div class="details">
      <div class="row"><span class="label">Plan:</span><span class="val">${result.planTitle}</span></div>
      <div class="row"><span class="label">Amount:</span><span class="val">₹${result.amount.toFixed(2)}</span></div>
      <div class="row"><span class="label">Txn ID:</span><span class="val">${result.txnid}</span></div>
      <div class="row"><span class="label">Status:</span><span class="val" style="color: ${themeColor};">${isSuccess ? "SUCCESS" : "FAILED"}</span></div>
    </div>
    <button class="btn" onclick="handleReturn()">Return to App</button>
  </div>
  <script>
    function handleReturn() {
      // 1. If inside Flutter WebView with JavascriptChannel
      if (window.VelloraPaymentBridge && window.VelloraPaymentBridge.postMessage) {
        window.VelloraPaymentBridge.postMessage(JSON.stringify({
          status: "${isSuccess ? "success" : "failure"}",
          txnid: "${result.txnid}"
        }));
      } else if (window.opener) {
        window.close();
      } else {
        window.history.back();
      }
    }
  </script>
</body>
</html>`;
}
