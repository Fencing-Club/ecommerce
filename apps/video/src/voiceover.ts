// The ad's voiceover, line by line, in order. `caption` is burned in on screen; `spoken` is what ElevenLabs reads,
// spelling out how to say "Copacker" and the acronyms. Both have the same number of words, so captions can follow the
// take word by word.
export const voiceover = {
  meet: {
    caption: "Meet Copacker.",
    spoken: "Meet Co-packer."
  },
  onePlace: {
    caption: "Every product, supplier, and shipment, in one place.",
    spoken: "Every product, supplier, and shipment, in one place."
  },
  connect: {
    caption: "Connect Amazon and Shopify, and Copacker tracks every unit you sell.",
    spoken: "Connect Amazon and Shopify, and Co-packer tracks every unit you sell."
  },
  forecast: {
    caption: "It tells you what to restock, when to order, and exactly how much.",
    spoken: "It tells you what to restock, when to order, and exactly how much."
  },
  stockout: {
    caption: "It even predicts what a stockout would cost you, and when to order to beat your busy season.",
    spoken: "It even predicts what a stockout would cost you, and when to order to beat your busy season."
  },
  order: {
    caption: "One click turns a restock into a purchase order for your supplier.",
    spoken: "One click turns a restock into a purchase order for your supplier."
  },
  packing: {
    caption: "They fill in the packing list right in Copacker.",
    spoken: "They fill in the packing list right in Co-packer."
  },
  amazon: {
    caption: "Shipping to Amazon? Copacker creates the shipment for you, and prints every label.",
    spoken: "Shipping to Amazon? Co-packer creates the shipment for you, and prints every label."
  },
  split: {
    caption:
      "It splits your inventory between FBA and AWD, including AWD warehouses in China and Vietnam, where storage costs even less.",
    spoken:
      "It splits your inventory between F.B.A. and A.W.D., including A.W.D. warehouses in China and Vietnam, where storage costs even less."
  },
  handoffs: {
    caption: "Suppliers, forwarders, and warehouses all work from the same record.",
    spoken: "Suppliers, forwarders, and warehouses all work from the same record."
  },
  updates: {
    caption: "They download labels, check the requirements, and post updates. No more chasing email threads.",
    spoken: "They download labels, check the requirements, and post updates. No more chasing email threads."
  },
  agents: {
    caption:
      "And it's AI-native. Copacker connects to your agents over MCP, so they can plan, order, and ship right alongside you.",
    spoken:
      "And it's A.I.-native. Co-packer connects to your agents over M.C.P., so they can plan, order, and ship right alongside you."
  },
  end: {
    caption: "Copacker. Restocking, handled.",
    spoken: "Co-packer. Restocking, handled."
  }
} as const
