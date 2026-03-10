import Razorpay from "razorpay";
import { env, hasRazorpayConfig } from "./env.js";

const razorpay = hasRazorpayConfig()
  ? new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    })
  : null;

export default razorpay;
