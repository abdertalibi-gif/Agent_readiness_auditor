/** Client-side feature flags derived from build-time env vars.
 * 
 * NEXT_PUBLIC_* variables are inlined by Next.js at build time, so these are
 * available in the browser bundle without any server round-trip.
 */
export const isMonetizationEnabled = () => {
  return process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";
};

export const isFreeMode = () => {
  return !isMonetizationEnabled();
};