import { Schema, model, type InferSchemaType } from "mongoose";

const siteContentSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "landing_page",
      index: true,
    },
    hero: {
      badge: { type: String, default: "Find Your Connection" },
      headline: {
        type: [String],
        default: ["Meet someone.", "Feel something.", "Make it meaningful."],
      },
      subtitle: {
        type: String,
        default:
          "Discover genuine people who share your interests, values, and vibe — and start a connection that feels real.",
      },
      googlePlayUrl: {
        type: String,
        default:
          "https://play.google.com/store/apps/details?id=com.suhtech.datingapp&pcampaignid=web_share",
      },
      appStoreUrl: { type: String, default: "" },
    },
    company: {
      legalName: { type: String, default: "Suh Tech Private Limited" },
      cin: { type: String, default: "U70200UP2024PTC197468" },
      gstin: { type: String, default: "" },
      registeredOffice: {
        type: String,
        default:
          "D-052/GF, Sector-32 PI, Eldeco Residency, Noida, Gautam Buddha Nagar, Uttar Pradesh - 201301",
      },
      supportEmail: {
        type: String,
        default: "suhtechpvtltdbuisness@gmail.com",
      },
      supportPhone: { type: String, default: "+91 75968 18126" },
      domain: { type: String, default: "vellora.my" },
      instagram: { type: String, default: "" },
      youtube: { type: String, default: "" },
      x: { type: String, default: "" },
    },
    handbook: {
      title: { type: String, default: "Safety Handbook" },
      description: {
        type: String,
        default:
          "Practical guidance on meeting online, setting boundaries, and trusting your instincts.",
      },
      ctaText: { type: String, default: "Read Safety Handbook" },
      ctaHref: { type: String, default: "#handbook" },
    },
    plansHeader: {
      eyebrow: { type: String, default: "Vellora Premium" },
      title: { type: String, default: "Want a little extra?" },
      subtitle: {
        type: String,
        default:
          "Premium adds a few perks on top. Every safety tool on this page stays free for everyone, whether you subscribe or not.",
      },
      perks: [
        {
          _id: false,
          title: String,
          description: String,
        },
      ],
      safetyNoteTitle: {
        type: String,
        default: "Safety is never a paid feature",
      },
      safetyNoteDesc: {
        type: String,
        default:
          "Verification, blocking, reporting and image blur are free on every account.",
      },
    },
    features: [
      {
        _id: false,
        id: String,
        icon: String,
        title: String,
        description: String,
        href: String,
      },
    ],
    faqs: [
      {
        _id: false,
        id: String,
        question: String,
        answer: String,
      },
    ],
    campaigns: [
      {
        _id: false,
        id: String,
        eyebrow: String,
        title: String,
        description: String,
        cta: String,
        href: String,
        art: String,
        image: String,
        imageAlt: String,
      },
    ],
    kinderTogether: {
      eyebrow: { type: String, default: "Community" },
      title: { type: String, default: "Kinder Together" },
      subtitle: {
        type: String,
        default: "A kinder dating community starts with how we treat each other.",
      },
      description: {
        type: String,
        default:
          "Vellora is built around respectful connections. Everyone deserves to feel comfortable, heard, and free to set their own boundaries.",
      },
      principles: [
        {
          _id: false,
          id: String,
          title: String,
          lead: String,
          items: [String],
        },
      ],
    },
    safetyTips: {
      title: { type: String, default: "Safety Tips" },
      lead: {
        type: String,
        default:
          "A simple guide to meeting new people, protecting your privacy, and knowing what to do if something feels wrong.",
      },
      sections: [
        {
          _id: false,
          id: String,
          title: String,
          lead: String,
          intro: String,
          items: [String],
        },
      ],
    },
    realTalk: {
      title: { type: String, default: "Real Talk Month" },
      subtitle: {
        type: String,
        default: "Real conversations. Safer connections.",
      },
      description: {
        type: String,
        default:
          "Stories, tips, and myth-busting about consent, catfishing, and online scams, in your feed and in the app.",
      },
      topics: [
        {
          _id: false,
          id: String,
          emoji: String,
          title: String,
          text: String,
        },
      ],
    },
  },
  { timestamps: true },
);

export type SiteContentDocument = InferSchemaType<typeof siteContentSchema>;
export const SiteContent = model("SiteContent", siteContentSchema);
export default SiteContent;
