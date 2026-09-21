import type { RefObject } from "react";
import { useEffect, useState } from "react";

export function useKeyPress(
  targetKey: string,
  ref?: RefObject<HTMLInputElement>,
  handler?: () => void
): boolean {
  // State for keeping track of whether key is pressed
  const [keyPressed, setKeyPressed] = useState(false);
  const placeHolderRef = ref?.current;
  // If pressed key is our target key then set to true
  function downHandler({ key }: { key: string }) {
    if (key === targetKey) {
      setKeyPressed(true);
      handler && handler();
    }
  }
  // If released key is our target key then set to false
  const upHandler = ({ key }: { key: string }) => {
    if (key === targetKey) {
      setKeyPressed(false);
    }
  };
  // Add event listeners
  useEffect(() => {
    if (ref && placeHolderRef) {
      placeHolderRef.addEventListener("keydown", downHandler);
      placeHolderRef.addEventListener("keyup", upHandler);
      return () => {
        placeHolderRef?.removeEventListener("keydown", downHandler);
        placeHolderRef?.removeEventListener("keyup", upHandler);
      };
    } else {
      window.addEventListener("keydown", downHandler);
      window.addEventListener("keyup", upHandler);
      // Remove event listeners on cleanup
      return () => {
        window.removeEventListener("keydown", downHandler);
        window.removeEventListener("keyup", upHandler);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array ensures that effect is only run on mount and unmount

  return keyPressed;
}
