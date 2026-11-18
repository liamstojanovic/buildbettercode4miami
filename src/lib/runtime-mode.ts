// Vercel deployments always run without external services, regardless of credentials.
export const hostedDemo = () => process.env.LASER_FOCUS_HOSTED_DEMO === "1" || process.env.VERCEL === "1";
