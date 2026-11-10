import { redirect } from "next/navigation";

// Cal.diy has no paid plans, so the plan-selection step is skipped. The route is kept because
// signup, email verification and the onboarding redirect hook still link here.
const ServerPage = () => {
  return redirect("/onboarding/personal/settings");
};

export default ServerPage;
