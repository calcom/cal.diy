import { useEffect, useState } from "react";

interface Props {
  children: React.ReactNode; // React.ReactNode
  fallback?: JSX.Element | null; // JSX.Element
}

const NoSSR = ({ children, fallback = null }: Props) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return fallback;
  }

  return <>{children}</>;
};

export default NoSSR;
