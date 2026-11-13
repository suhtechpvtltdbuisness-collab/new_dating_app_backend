import SiteContent from "../models/SiteContent";

export const DEFAULT_FEATURES = [
  {
    id: "photo-verification",
    icon: "camera",
    title: "Photo Verification",
    description:
      "Take a quick selfie and we check that it matches your photos. Verified profiles get a badge, so you know who's real.",
    href: "#faq",
  },
  {
    id: "id-verification",
    icon: "idCard",
    title: "ID Verification",
    description:
      "Confirm your identity with a government ID. We use it to verify you, and it never appears on your profile.",
    href: "#faq",
  },
  {
    id: "scam-detector",
    icon: "sparkles",
    title: "Scam Detector",
    description:
      "Automated checks look for signs of fake profiles and romance scams, and a human reviewer checks anything it flags.",
    href: "#faq",
  },
  {
    id: "block-report",
    icon: "shieldBan",
    title: "Block, Report, Unmatch",
    description:
      "One tap from any chat or profile. They don't find out who reported them, and our team reviews every report.",
    href: "#faq",
  },
  {
    id: "share-date",
    icon: "share",
    title: "Share Your Date",
    description:
      "Send a trusted friend who you're meeting, where, and when, straight from the chat.",
    href: "#faq",
  },
  {
    id: "calls",
    icon: "video",
    title: "Protected Calls",
    description:
      "Voice and video calls through the app, without giving out your phone number.",
    href: "#faq",
  },
  {
    id: "message-check",
    icon: "messageCheck",
    title: "Message Check",
    description: "We flag suspicious messages before you open them.",
    href: "#faq",
  },
  {
    id: "incognito",
    icon: "eyeOff",
    title: "Incognito Mode",
    description: "Browse without being seen by people you haven't liked.",
    href: "#faq",
  },
];

export const DEFAULT_FAQS = [
  {
    id: "report",
    question: "How do I report someone?",
    answer:
      "Open their profile or your chat with them, tap the ⋯ menu, then choose Report. Pick a reason and add any details. They won't be told who reported them, and our moderation team reviews every report.",
  },
  {
    id: "block",
    question: "What happens when I block or unmatch someone?",
    answer:
      "They disappear from your matches and chats, and they can't see your profile or message you again. You can block someone even if you never matched with them.",
  },
  {
    id: "verification",
    question: "What does the verified badge mean?",
    answer:
      "The badge means the person passed our selfie check, so their face matches their profile photos. It lowers the risk of fakes but doesn't guarantee anyone's intentions, so keep using your judgement.",
  },
  {
    id: "id-data",
    question: "What happens to my ID after verification?",
    answer:
      "We use your ID only to confirm who you are. It's never shown on your profile or shared with other members. You can see how long we keep it, and ask us to delete it, in our Privacy Policy.",
  },
  {
    id: "scam",
    question: "Someone asked me for money. What should I do?",
    answer:
      "Don't send it, even if their story sounds urgent or convincing. Asking for money, gift cards, or crypto is a classic sign of a romance scam. Report the profile so our team can review it.",
  },
  {
    id: "emergency",
    question: "Can the app help me in an emergency?",
    answer:
      "We aren't an emergency service and can't send help. If you're in danger, call your local emergency number right away (for example 112 in India or the EU, or 911 in the US). Once you're safe, report the person in the app so we can take action.",
  },
];

export const DEFAULT_CAMPAIGNS = [
  {
    id: "first-date-workshops",
    eyebrow: "Workshops",
    title: "First Date, Safe Date",
    description:
      "Free evening sessions in partner cafés on spotting red flags, planning a safe first meet, and trusting your gut.",
    cta: "Read safety tips",
    href: "/safety-tips",
    art: "from-[#FF3D77] to-[#FF8A3D]",
    image: "/illustrations/campaign-workshop.svg",
    imageAlt:
      "Two coffee cups on a café table under a warm lamp, with steam rising into a heart",
  },
  {
    id: "community-partners",
    eyebrow: "Community",
    title: "Kinder Together",
    description:
      "We're building relationships with local non-profits that support survivors and teach digital safety. Partner announcements are coming soon.",
    cta: "Partner with us",
    href: "/kinder-together",
    art: "from-[#E0299B] to-[#8B2FC9]",
    image: "/illustrations/campaign-community.svg",
    imageAlt: "Three smiling friends standing together in front of a large heart",
  },
  {
    id: "awareness",
    eyebrow: "Awareness",
    title: "Real Talk Month",
    description:
      "Stories, tips, and myth-busting about consent, catfishing, and online scams, in your feed and in the app.",
    cta: "Read the stories",
    href: "/real-talk",
    art: "from-[#8B2FC9] to-[#FF3D77]",
    image: "/illustrations/campaign-awareness.svg",
    imageAlt:
      "A phone showing a chat with a safety badge, next to a shield with a check mark",
  },
];

export const DEFAULT_PERKS = [
  { title: "Unlimited likes", description: "Like as many people as you want." },
  { title: "Incognito mode", description: "Only be shown to people you've liked." },
];

export const DEFAULT_KINDER_TOGETHER = {
  eyebrow: "Community",
  title: "Kinder Together",
  subtitle: "A kinder dating community starts with how we treat each other.",
  description:
    "Vellora is built around respectful connections. Everyone deserves to feel comfortable, heard, and free to set their own boundaries.",
  principles: [
    {
      id: "respect",
      title: "Treat People With Respect",
      lead: "Every interaction shapes our community.",
      items: [
        "Be respectful, even when you're not interested.",
        "Accept “no” without arguing or pressuring.",
        "Avoid harassment, insults, threats, or hateful behavior.",
        "Remember that there is a real person behind every profile.",
      ],
    },
    {
      id: "boundaries",
      title: "Respect Boundaries",
      lead: "Consent and comfort matter at every step.",
      items: [
        "Don't pressure someone to share personal information.",
        "Don't pressure someone to meet, continue chatting, or share photos.",
        "Respect someone's decision to end a conversation or date.",
        "Give others the same space and respect you expect.",
      ],
    },
  ],
};

export const DEFAULT_SAFETY_TIPS = {
  title: "Safety Tips",
  lead:
    "A simple guide to meeting new people, protecting your privacy, and knowing what to do if something feels wrong.",
  sections: [
    {
      id: "before-you-meet",
      title: "Before You Meet",
      lead: "Take your time.",
      intro: "Get to know someone through the app before deciding to meet in person.",
      items: [
        "Keep your first conversations on Vellora.",
        "Don't feel pressured to share personal information.",
        "Look for consistent and genuine profile information.",
        "Be cautious if someone asks for money, financial information, or favors.",
      ],
    },
    {
      id: "plan-your-date",
      title: "Plan Your First Date Safely",
      lead: "Choose a public place.",
      intro: "Public venues with good lighting are always safest for first meets.",
      items: [
        "Meet at a busy café, restaurant, mall, or other public location.",
        "Arrange your own transportation whenever possible.",
        "Tell a trusted friend or family member where you're going.",
        "Share your planned meeting location and expected return time.",
      ],
    },
    {
      id: "during-the-date",
      title: "During the Date",
      lead: "Stay in control.",
      intro: "Your comfort and personal boundaries always come first.",
      items: [
        "Keep your personal belongings and drinks with you.",
        "Don't leave drinks unattended.",
        "Have an exit plan if you feel uncomfortable.",
        "You have the right to leave at any time for any reason.",
      ],
    },
  ],
};

export const DEFAULT_REAL_TALK = {
  title: "Real Talk Month",
  subtitle: "Real conversations. Safer connections.",
  description:
    "Stories, tips, and myth-busting about consent, catfishing, and online scams, in your feed and in the app.",
  topics: [
    {
      id: "communication",
      emoji: "💬",
      title: "Healthy Communication",
      text: "Learn how to communicate honestly, handle rejection respectfully, and have conversations about boundaries.",
    },
    {
      id: "red-flags",
      emoji: "🛡️",
      title: "Spot the Red Flags",
      text: "Understand common warning signs such as rushing intimacy, inconsistent stories, pressure, controlling behavior, or requests for money.",
    },
    {
      id: "catfishing",
      emoji: "🎭",
      title: "Catfishing & Fake Profiles",
      text: "Learn how to identify suspicious profiles and why you should take your time before trusting someone you've met online.",
    },
    {
      id: "scams",
      emoji: "💰",
      title: "Dating & Online Scams",
      text: "Know the warning signs when someone asks for money, financial information, gifts, or urgent help.",
    },
    {
      id: "privacy",
      emoji: "🔐",
      title: "Protect Your Privacy",
      text: "Tips for protecting your photos, personal information, passwords, OTPs, location, and other sensitive details.",
    },
    {
      id: "consent",
      emoji: "❤️",
      title: "Boundaries & Consent",
      text: "Understand that everyone has the right to set boundaries, change their mind, and say no without pressure.",
    },
  ],
};

export async function getOrCreateSiteContent() {
  let content = await SiteContent.findOne({ key: "landing_page" }).lean();
  if (!content) {
    const created = await SiteContent.create({
      key: "landing_page",
      features: DEFAULT_FEATURES,
      faqs: DEFAULT_FAQS,
      campaigns: DEFAULT_CAMPAIGNS,
    });
    return created.toObject();
  }

  // Populate any missing arrays if empty
  let needsSave = false;
  const updateObj: Record<string, unknown> = {};

  if (!content.features || content.features.length === 0) {
    updateObj.features = DEFAULT_FEATURES;
    needsSave = true;
  }
  if (!content.faqs || content.faqs.length === 0) {
    updateObj.faqs = DEFAULT_FAQS;
    needsSave = true;
  }
  if (!content.campaigns || content.campaigns.length === 0) {
    updateObj.campaigns = DEFAULT_CAMPAIGNS;
    needsSave = true;
  }
  if (!content.plansHeader || !content.plansHeader.title) {
    updateObj.plansHeader = {
      eyebrow: "Vellora Premium",
      title: "Want a little extra?",
      subtitle:
        "Premium adds a few perks on top. Every safety tool on this page stays free for everyone, whether you subscribe or not.",
      perks: DEFAULT_PERKS,
      safetyNoteTitle: "Safety is never a paid feature",
      safetyNoteDesc:
        "Verification, blocking, reporting and image blur are free on every account.",
    };
    needsSave = true;
  }
  if (!content.kinderTogether || !content.kinderTogether.title) {
    updateObj.kinderTogether = DEFAULT_KINDER_TOGETHER;
    needsSave = true;
  }
  if (!content.safetyTips || !content.safetyTips.title) {
    updateObj.safetyTips = DEFAULT_SAFETY_TIPS;
    needsSave = true;
  }
  if (!content.realTalk || !content.realTalk.title) {
    updateObj.realTalk = DEFAULT_REAL_TALK;
    needsSave = true;
  }

  if (needsSave) {
    const updated = await SiteContent.findOneAndUpdate(
      { key: "landing_page" },
      { $set: updateObj },
      { new: true },
    ).lean();
    return updated || content;
  }

  return content;
}

export async function updateSiteContent(data: Partial<typeof SiteContent>) {
  const updated = await SiteContent.findOneAndUpdate(
    { key: "landing_page" },
    { $set: data },
    { new: true, upsert: true },
  ).lean();
  return updated;
}
