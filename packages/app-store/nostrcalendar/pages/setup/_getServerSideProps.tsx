import type { GetServerSidePropsContext } from "next";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const { req } = ctx;
  const session = await getServerSession({ req });

  if (!session?.user?.id) {
    return {
      redirect: {
        permanent: false,
        destination: "/auth/login",
      },
    };
  }

  return {
    props: {},
  };
};
