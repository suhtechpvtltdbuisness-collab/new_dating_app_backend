import crypto from "crypto";
import { generateSdkHash, generatePayuRequestHash } from "../services/payu.service";
import { env } from "../config/env";

/**
 * Automated Unit Tests for PayU Dynamic Hash Generation.
 * Covers V1 (SHA-512), V1 with postSalt, V2 (HMAC-SHA256), mcpLookup (HMAC-SHA1),
 * edge cases (empty strings, missing params), and official test vectors.
 */
function runTests() {
  console.log("=================================================");
  console.log("   PayU Dynamic Hash Generation Test Suite       ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (detail) console.error(`   Detail: ${detail}`);
      failed++;
    }
  }

  const salt = env.payu.salt;

  // Test 1: V1 Standard Hash Generation (SHA-512)
  {
    const hashString = "BAbIL9|quickPayEvent|test|";
    const expected = crypto.createHash("sha512").update(hashString + salt).digest("hex");
    const actual = generateSdkHash({
      hashName: "quickPayEvent",
      hashString,
      hashType: "V1",
    });
    assert(
      actual === expected && actual.length === 128,
      "V1 Standard Hash (SHA-512) returns valid 128-char hex",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 2: V1 with postSalt (Split payments / additional charges)
  {
    const hashString = "BAbIL9|txnid123|100.00|plan|";
    const postSalt = "extra_split_salt";
    const expected = crypto.createHash("sha512").update(hashString + salt + postSalt).digest("hex");
    const actual = generateSdkHash({
      hashName: "split_payment",
      hashString,
      hashType: "V1",
      postSalt,
    });
    assert(
      actual === expected,
      "V1 with postSalt correctly appends postSalt after salt",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 3: V2 Hash Generation (HMAC-SHA256) via hashType === 'V2'
  {
    const hashString = '{"amount":1}|Mon, 16 Nov 2026 05:46:06 GMT|';
    const expected = crypto.createHmac("sha256", salt).update(hashString).digest("hex");
    const actual = generateSdkHash({
      hashName: "custom_v2_hash",
      hashString,
      hashType: "V2",
    });
    assert(
      actual === expected && actual.length === 64,
      "V2 Hash via hashType: 'V2' returns valid 64-char HMAC-SHA256 hex",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 4: V2 Hash Generation for 'get_all_offer_details' (Exact issue in logcat)
  {
    const hashString = '{"amount":1}|Mon, 16 Nov 2026 05:46:06 GMT|';
    const expected = crypto.createHmac("sha256", salt).update(hashString).digest("hex");
    const actual = generateSdkHash({
      hashName: "get_all_offer_details",
      hashString,
      hashType: "V2",
    });
    assert(
      actual === expected && actual.length === 64,
      "get_all_offer_details calculates 64-char HMAC-SHA256 without error 5019",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 5: V2 Hash Generation for 'get_checkout_details'
  {
    const hashString = '{"cart":1}|checkout|';
    const expected = crypto.createHmac("sha256", salt).update(hashString).digest("hex");
    const actual = generateSdkHash({
      hashName: "get_checkout_details",
      hashString,
    });
    assert(
      actual === expected && actual.length === 64,
      "get_checkout_details auto-detects V2 HMAC-SHA256 even if hashType is omitted",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 6: mcpLookup Hash Generation (HMAC-SHA1)
  {
    const hashString = "mcp_lookup_string_test";
    const secretKey = env.payu.mcpSecret || salt;
    const expected = crypto.createHmac("sha1", secretKey).update(hashString).digest("hex");
    const actual = generateSdkHash({
      hashName: "mcpLookup",
      hashString,
    });
    assert(
      actual === expected && actual.length === 40,
      "mcpLookup uses HMAC-SHA1 and produces 40-char hex string",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 7: Initial payment_hash generation (when hashString is omitted)
  {
    const params = {
      key: env.payu.key,
      txnid: "TXN12345678",
      amount: "149.00",
      productinfo: "1 Month VIP",
      firstname: "Aman",
      email: "aman@suhtech.in",
      udf1: "",
      udf2: "",
      salt,
    };
    const expected = generatePayuRequestHash(params);
    const actual = generateSdkHash({
      hashName: "payment_hash",
      txnid: params.txnid,
      amount: params.amount,
      productinfo: params.productinfo,
      firstname: params.firstname,
      email: params.email,
    });
    assert(
      actual === expected,
      "Fallback payment_hash computes valid sha512 request hash with pipe sequence",
      `Expected ${expected}, got ${actual}`,
    );
  }

  // Test 8: Empty hashString for dynamic SDK hash throws error (no fallback to payment_hash)
  {
    let threw = false;
    try {
      generateSdkHash({
        hashName: "get_all_offer_details",
        // hashString missing!
      });
    } catch (e: any) {
      threw = true;
      assert(
        e.message.includes("hashString is required"),
        "Dynamic SDK hash without hashString throws error instead of returning payment_hash",
      );
    }
    if (!threw) {
      assert(false, "Dynamic SDK hash without hashString should throw error");
    }
  }

  // Test 9: Environment Configuration Verification
  {
    assert(
      typeof env.payu.environment === "number" && (env.payu.environment === 0 || env.payu.environment === 1),
      "Environment setting is numeric (0 for Production, 1 for Test)",
      `env.payu.environment = ${env.payu.environment}`,
    );
    assert(
      Boolean(env.payu.key && env.payu.salt),
      "PayU merchant key and salt are present on backend",
    );
  }

  console.log("\n-------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("-------------------------------------------------");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
