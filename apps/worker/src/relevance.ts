export type IncidentPriority = "critical" | "high" | "medium";
export type ClassifiedIncidentCategory =
 | "kidnapping" | "robbery" | "theft" | "assault" | "fire" | "road_accident"
 | "flooding" | "building_collapse" | "public_disturbance" | "missing_person"
 | "disease_outbreak" | "terrorism" | "shooting" | "banditry";

export type RelevanceClassification = {
 relevanceStatus: "relevant";
 category: ClassifiedIncidentCategory;
 priority: IncidentPriority;
 relevanceScore: number;
 matchedTerms: string[];
 detectedState: string | null;
 classificationReason: string;
};

const stateNames = [
 "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
 "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa",
 "Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger",
 "Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe",
 "Zamfara","Federal Capital Territory"
] as const;

type Rule = {category: ClassifiedIncidentCategory; priority: IncidentPriority; score: number; patterns: RegExp[]};
const rules: Rule[] = [
 {category:"kidnapping",priority:"critical",score:98,patterns:[/\bkidnapp(?:ed|ing)?\b/i,/\babduct(?:ed|ion)?\b/i,/\bheld hostage\b/i,/\bransom demand\b/i]},
 {category:"terrorism",priority:"critical",score:98,patterns:[/\bterroris(?:m|t|ts)\b/i,/\binsurgent(?:s|cy)?\b/i,/\bboko haram\b/i,/\biswap\b/i,/\bsuicide bomber\b/i,/\bterror attack\b/i]},
 {category:"disease_outbreak",priority:"critical",score:97,patterns:[/\bebola\b/i,/\blassa fever\b/i,/\bcholera outbreak\b/i,/\bmpox outbreak\b/i,/\bmeningitis outbreak\b/i,/\bpolio outbreak\b/i]},
 {category:"banditry",priority:"critical",score:96,patterns:[/\bbandit(?:s|ry)?\b/i,/\barmed gang\b/i,/\bcattle rustl(?:er|ing)\b/i]},
 {category:"shooting",priority:"high",score:91,patterns:[/\bshoot(?:ing|out|ings)?\b/i,/\bgunmen\b/i,/\bshot dead\b/i,/\bopened fire\b/i,/\bgunfire\b/i]},
 {category:"robbery",priority:"high",score:88,patterns:[/\barmed robber(?:y|s)?\b/i,/\brobber(?:y|s)?\b/i,/\bhighway robbery\b/i]},
 {category:"building_collapse",priority:"high",score:87,patterns:[/\bbuilding collapse\b/i,/\bstructure collapse\b/i,/\bcollapsed building\b/i,/\bcollapsed structure\b/i]},
 {category:"fire",priority:"high",score:85,patterns:[/\bfire outbreak\b/i,/\bbuilding fire\b/i,/\bmarket fire\b/i,/\bwarehouse fire\b/i,/\bexplosion\b/i,/\bblaze\b/i]},
 {category:"flooding",priority:"high",score:84,patterns:[/\bflood(?:ing|ed)?\b/i,/\bflash flood\b/i,/\bflood alert\b/i]},
 {category:"disease_outbreak",priority:"high",score:82,patterns:[/\b(?:disease|virus|fever) outbreak\b/i,/\bepidemic\b/i,/\bpublic health emergency\b/i,/\bconfirmed cases of (?:cholera|mpox|meningitis|lassa)\b/i]},
 {category:"public_disturbance",priority:"high",score:80,patterns:[/\briot(?:s|ing)?\b/i,/\bviolent clash(?:es)?\b/i,/\bcommunal clash(?:es)?\b/i,/\bethnic clash(?:es)?\b/i,/\bviolent protest(?:s)?\b/i]},
 {category:"assault",priority:"medium",score:72,patterns:[/\b(?:physically )?assault(?:ed)?\b/i,/\bstab(?:bed|bing)\b/i,/\bbeaten to death\b/i,/\battacked by (?:a|an) (?:mob|gang)\b/i]},
 {category:"road_accident",priority:"medium",score:68,patterns:[/\broad accident\b/i,/\bmultiple[- ]vehicle crash\b/i,/\bvehicle collision\b/i,/\btruck crash\b/i,/\bbus crash\b/i,/\bcar crash\b/i,/\bcrash claims? lives\b/i]},
 {category:"missing_person",priority:"medium",score:65,patterns:[/\bmissing person\b/i,/\bperson reported missing\b/i,/\bmissing child\b/i]}
];

function detectState(text: string): string | null {
 const normalized = text.toLowerCase();
 if (/\b(?:fct|abuja|federal capital territory)\b/i.test(normalized)) return "Federal Capital Territory";
 return stateNames.find(state => new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`, "i").test(text)) ?? null;
}

export function classifyFeedItem(item: {title: string; summary: string}): RelevanceClassification | null {
 const text = `${item.title}. ${item.summary}`;
 for (const rule of rules) {
  const matchedTerms = rule.patterns.flatMap(pattern => text.match(pattern) ? [text.match(pattern)![0].toLowerCase()] : []);
  if (matchedTerms.length === 0) continue;
  const uniqueTerms = [...new Set(matchedTerms)];
  return {
   relevanceStatus: "relevant",
   category: rule.category,
   priority: rule.priority,
   relevanceScore: rule.score,
   matchedTerms: uniqueTerms,
   detectedState: detectState(text),
   classificationReason: `Matched public-safety indicators: ${uniqueTerms.join(", ")}`
  };
 }
 return null;
}
