import { Router } from "express";
import { authenticateAccessToken } from "../middlewares/authenticate";
import {
  initiatePaymentHandler,
  renderCheckoutPageHandler,
  payuSuccessCallbackHandler,
  payuFailureCallbackHandler,
  verifyPaymentHandler,
  getPaymentStatusHandler,
  getUserPaymentHistoryHandler,
  generateHashHandler,
} from "../controller/payment.controller";

const paymentRouter = Router();

// PayU Hosted Checkout Page for WebView / Browser (Auto-submitting HTML form)
paymentRouter.get("/payu/checkout/:txnid", renderCheckoutPageHandler);

// PayU Return Callbacks (PayU posts form-data back to these URLs)
paymentRouter.post("/payu/success", payuSuccessCallbackHandler);
paymentRouter.post("/payu/failure", payuFailureCallbackHandler);

// Dynamic Hash Generation for Mobile SDK (payu_checkoutpro_flutter)
paymentRouter.post("/payu/generate-hash", generateHashHandler);

// User endpoints (requires Auth Token)
paymentRouter.post("/initiate", authenticateAccessToken, initiatePaymentHandler);
paymentRouter.get("/history", authenticateAccessToken, getUserPaymentHistoryHandler);

// Status & Verification endpoints
paymentRouter.get("/status/:txnid", getPaymentStatusHandler);
paymentRouter.post("/verify", verifyPaymentHandler);

export default paymentRouter;
