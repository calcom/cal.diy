import { _generateMetadata } from "app/_utils";

import VerifyPage from "~/auth/verify-view";

export const generateMetadata = async () => {
  return await _generateMetadata(
    () => `Verify your email`,
    () => "",
    undefined,
    undefined,
    "/auth/verify"
  );
};

const ServerPage = () => {
  return <VerifyPage EMAIL_FROM={process.env.EMAIL_FROM} />;
};

export default ServerPage;
