import { IMAGE_MODEL, toBase64 } from "./health.js";

// ===== صور الفيديوهات التعليمية (للمدير بس) =====
// كل صورة تنولد بذكاء الموقع وتنحفظ في food_images بمفتاح edu:<id>، وما تطلع لأحد في الموقع
const MAN = "an elderly Saudi man with a short white beard wearing a white thobe";
const HELPER = "a young Saudi man in a white thobe";
const STYLE = "Realistic photograph, natural soft light, warm home interior, sharp focus, true-to-life anatomy with five fingers on each hand. No text, no letters, no numbers, no logos, no watermark.";

export const EDU_PROMPTS = {
  // إبرة الإنسولين
  "ins-wash": `Close-up of ${MAN}'s hands being washed with soap under a running tap in a clean bathroom sink.`,
  "ins-supplies": `Top-down view on a wooden table: a disposable insulin pen with its cap off, a small packaged pen needle, alcohol swabs, a small glucose meter and a sharps container.`,
  "ins-check": `Close-up of an elderly hand holding a disposable insulin pen and looking at the clear liquid through the small window of the pen.`,
  "ins-roll": `Close-up of two hands gently rolling a disposable insulin pen between the palms.`,
  "ins-needle": `Close-up of hands screwing a small pen needle straight onto the tip of a disposable insulin pen.`,
  "ins-prime": `Close-up of a disposable insulin pen held upright with the needle pointing up, a tiny drop of liquid at the needle tip.`,
  "ins-dial": `Close-up of fingers turning the dose knob at the end of a disposable insulin pen.`,
  "ins-sites": `${MAN} sitting on a sofa, lifting his thobe slightly to show the side of his belly, calm expression, modest framing.`,
  "ins-pinch": `Close-up of fingers gently pinching a fold of skin on the side of the belly of an elderly man.`,
  "ins-inject": `Close-up of an elderly man injecting himself in the side of the belly with a disposable insulin pen held straight at 90 degrees, thumb pressing the button.`,
  "ins-hold": `Close-up of a thumb holding down the button of an insulin pen pressed against the skin of the belly, patient and calm.`,
  "ins-remove": `Close-up of hands carefully unscrewing a used pen needle from an insulin pen and dropping it into a yellow sharps container.`,
  "ins-caregiver": `${HELPER} kneeling beside ${MAN} on a sofa, gently giving him an insulin pen injection in the side of the belly, caring and respectful.`,
  "ins-caregiver-gloves": `${HELPER} wearing blue medical gloves holding a disposable insulin pen, ready to help an elderly man, home setting.`,
  "ins-fridge": `An open home refrigerator door shelf holding a box of insulin pens, clean and organized.`,
  "ins-hypo": `${MAN} sitting and drinking a small glass of orange juice, with a few dates on a small plate next to him.`,
  // قياس السكر
  "sug-meter": `Top-down view on a white table: a small digital glucose meter, a lancing device, a vial of test strips and cotton balls.`,
  "sug-wash": `Close-up of elderly hands being dried with a clean towel after washing.`,
  "sug-strip": `Close-up of fingers inserting a thin test strip into a small digital glucose meter.`,
  "sug-lance": `Close-up of a lancing device pressed against the side of an elderly man's fingertip.`,
  "sug-drop": `Close-up of a small round drop of blood on the side of a fingertip.`,
  "sug-touch": `Close-up of a fingertip with a drop of blood touching the edge of a test strip inserted in a small glucose meter.`,
  "sug-read": `${MAN} sitting at a table looking at a small glucose meter in his hand, calm.`,
  "sug-log": `${MAN} holding a smartphone at a table, about to write down his reading, with a small glucose meter beside him.`,
  // قياس الضغط
  "bp-rest": `${MAN} sitting relaxed in a chair with his back supported, feet flat on the floor, resting quietly before measuring blood pressure.`,
  "bp-device": `An automatic upper-arm blood pressure monitor with its cuff on a wooden table.`,
  "bp-cuff": `Close-up of a blood pressure cuff being wrapped around the bare upper arm of an elderly man, sleeve rolled up.`,
  "bp-position": `${MAN} seated at a table with a blood pressure cuff on his upper arm, his arm resting on the table at chest level, feet flat on the floor, about to press the start button.`,
  "bp-measure": `${MAN} sitting still and quiet with an inflated blood pressure cuff on his upper arm resting on a table.`,
  "bp-avoid": `A cup of Arabic coffee and a small cup of tea on a tray, softly out of focus, on a table.`,
  // قياس الحرارة
  "tmp-devices": `Top-down view on a white table: a digital stick thermometer and an infrared forehead thermometer.`,
  "tmp-oral": `${MAN} with a digital thermometer under his tongue, mouth closed, sitting calmly.`,
  "tmp-forehead": `${HELPER} gently holding an infrared thermometer near the forehead of ${MAN}.`,
  "tmp-armpit": `${MAN} holding a digital thermometer under his armpit, arm pressed to his side, sitting on a bed.`,
  "tmp-fever": `${MAN} resting in bed with a blanket, a glass of water on the bedside table, looking tired.`,
  "tmp-clean": `Close-up of hands wiping the tip of a digital thermometer with an alcohol swab.`,
  // قطرات العين
  "eye-wash": `Close-up of hands being washed with soap at a sink.`,
  "eye-bottles": `Three small plastic eye drop bottles standing on a white table, no labels visible.`,
  "eye-tilt": `${MAN} sitting with his head tilted back, looking up at the ceiling.`,
  "eye-pull": `Close-up of an elderly man gently pulling down his lower eyelid with one finger to make a small pocket.`,
  "eye-drop": `Close-up of an eye drop bottle held above an elderly man's eye, a single drop falling into the lower eyelid pocket, the bottle tip not touching the eye.`,
  "eye-press": `Close-up of an elderly man with his eyes closed, pressing gently with one finger at the inner corner of his eye near the nose.`,
  "eye-wait": `${MAN} sitting with his eyes closed, resting calmly, a wall clock softly in the background.`,
  "eye-helper": `${HELPER} gently putting an eye drop into the eye of ${MAN} who is lying back on a sofa.`,
  // تنظيم الأدوية
  "med-organizer": `A weekly pill organizer box with small compartments, some filled with tablets, on a wooden table.`,
  "med-fill": `Close-up of elderly hands filling a weekly pill organizer with tablets.`,
  "med-water": `${MAN} taking a tablet with a full glass of water, sitting at a kitchen table.`,
  "med-phone": `${MAN} looking at a reminder on his smartphone, with a pill organizer on the table.`,
  "med-storage": `A medicine cabinet shelf with medicine boxes neatly arranged, in a cool dry room.`,
  "med-doctor": `${MAN} with his son sitting in a doctor's office, the doctor in a white coat reviewing medicine boxes with them.`,
  "med-expired": `Close-up of hands holding a medicine box and checking the bottom edge of it, no readable text.`,
  "med-family": `${HELPER} sitting next to ${MAN} at home, smiling, holding his hand warmly.`,
};

export const eduKey = (id) => `edu:${id}`;

export async function eduStatus(db) {
  const rows = (await db.prepare("SELECT k FROM food_images WHERE k LIKE 'edu:%'").all()).results;
  const done = new Set(rows.map((r) => r.k.slice(4)));
  return Object.keys(EDU_PROMPTS).map((id) => ({ id, done: done.has(id) }));
}

export async function eduImage(env, db, id) {
  const prompt = EDU_PROMPTS[id];
  if (!prompt) throw new Error("صورة مو معروفة");
  let image;
  if (env.MOCK_AI === "1") {
    image = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#C79A5B"/></svg>`)}`;
  } else {
    if (!env.AI) throw new Error("الذكاء الاصطناعي مو مربوط");
    const res = await env.AI.run(IMAGE_MODEL, { prompt: `${prompt} ${STYLE}`, steps: 8 });
    image = `data:image/jpeg;base64,${await toBase64(res)}`;
  }
  await db.prepare("INSERT OR REPLACE INTO food_images (k, image) VALUES (?, ?)").bind(eduKey(id), image).run();
  return { id, done: true };
}
