/** Shared city vocabulary for ingestion and discovery. No server dependencies. */
export const FILTER_CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

const CITY_ALIASES: Record<string, readonly string[]> = {
  bangalore: ["bangalore", "bengaluru", "bangalore urban", "bengaluru urban", "whitefield", "koramangala", "indiranagar", "hsr layout"],
  mumbai: ["mumbai", "bombay", "navi mumbai", "thane", "bkc", "bandra", "powai", "andheri", "vile parle"],
  delhi: ["delhi", "new delhi", "delhi ncr", "gurgaon", "gurugram", "noida", "greater noida", "ghaziabad", "okhla", "dwarka", "rohini"],
  hyderabad: ["hyderabad", "secunderabad", "hitec city", "gachibowli", "kukatpally", "banjara hills"],
  pune: ["pune", "pimpri chinchwad", "baner", "hinjawadi", "hinjewadi", "kothrud", "viman nagar", "magarpatta"],
  chennai: ["chennai", "madras", "adyar", "anna nagar", "velachery", "guindy"],
};

export function cityAliases(city: string): readonly string[] {
  const key = city.toLowerCase().trim();
  const canonical = Object.entries(CITY_ALIASES).find(([name, aliases]) => name === key || aliases.includes(key));
  return canonical?.[1] ?? (key ? [key] : []);
}

export function normaliseMode(mode?: string): string | undefined {
  const key = mode?.trim().toLowerCase();
  if (key === "online") return "online";
  if (key === "offline" || key === "in-person" || key === "in person") return "offline";
  return undefined;
}
