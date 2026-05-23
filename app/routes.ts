import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth", "routes/auth.tsx"),
  route("dashboard", "routes/dashboard.tsx", [
    index("routes/dashboard.index.tsx"),
    route("workflows", "routes/dashboard.workflows.tsx"),
    route("settings", "routes/dashboard.settings.tsx"),
    route("profile", "routes/dashboard.profile.tsx"),
  ]),
  route("flow", "routes/flow.tsx"),
] satisfies RouteConfig;
