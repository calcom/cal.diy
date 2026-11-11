import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import type { GetServerSidePropsContext } from "next";
import type { z } from "zod";
import appConfig from "../../config.json";
import { appKeysSchema } from "../../zod";

export type IStablezactSetupProps = z.infer<typeof appKeysSchema>;

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  try {
    const notFound = { notFound: true } as const;
    if (typeof ctx.params?.slug !== "string") return notFound;

    const { req } = ctx;
    const session = await getServerSession({ req });
    if (!session?.user?.id) return { redirect: { permanent: false, destination: "/auth/login" } };

    const credential = await CredentialRepository.findFirstByUserIdAndType({
      userId: session.user.id,
      type: appConfig.type,
    });

    let props: IStablezactSetupProps | undefined;
    if (credential?.key) {
      const keyParsing = appKeysSchema.safeParse(credential.key);
      if (keyParsing.success) {
        props = keyParsing.data;
      }
    }
    return { props: props ?? {} };
  } catch (error) {
    console.error("[Stablezact] Failed to load setup props", error);
    return {
      props: {},
    };
  }
};
