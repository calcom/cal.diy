export const BookingConfirmationForm = (props: { action: string; children: React.ReactNode }) => {
  return (
    <form action={props.action} method="POST" target="_blank">
      {props.children}
      <p
        style={{
          display: "inline-block",
          background: "#FFFFFF",
          border: "",
          color: "#ffffff",
          fontFamily: "Roboto, Helvetica, sans-serif",
          fontSize: "0.875rem",
          fontWeight: 500,
          lineHeight: "1rem",
          margin: 0,
          textDecoration: "none",
          textTransform: "none",
          padding: "0.625rem 0",
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          msoPaddingAlt: "0px",
          borderRadius: "6px",
          boxSizing: "border-box",
          height: "2.25rem",
          width: "100%",
        }}>
        <label
          style={{
            color: "#3e3e3e",
            fontFamily: "Roboto, Helvetica, sans-serif",
            fontSize: "0.875rem",
            fontWeight: 500,
            lineHeight: "1rem",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            display: "block",
          }}>
          Reason for rejection &nbsp;
          <small>(Optional)</small>
        </label>
        <textarea
          name="reason"
          placeholder="Why are you rejecting?"
          style={{
            appearance: "none",
            backgroundColor: "rgb(255, 255, 255)",
            borderBottomColor: "rgb(209, 213, 219)",
            borderBottomLeftRadius: "6px",
            borderBottomRightRadius: "6px",
            borderBottomStyle: "solid",
            borderBottomWidth: "1px",
            borderLeftColor: "rgb(209, 213, 219)",
            borderLeftStyle: "solid",
            borderLeftWidth: "1px",
            borderRightColor: "rgb(209, 213, 219)",
            borderRightStyle: "solid",
            borderRightWidth: "1px",
            borderTopColor: "rgb(209, 213, 219)",
            borderTopLeftRadius: "6px",
            borderTopRightRadius: "6px",
            borderTopStyle: "solid",
            borderTopWidth: "1px",
            boxSizing: "border-box",
            color: "rgb(56, 66, 82)",
            display: "block",
            fontSize: "14px",
            lineHeight: "20px",
            marginBottom: "16px",
            marginLeft: "0px",
            marginRight: "0px",
            marginTop: "8px",
            paddingBottom: "8px",
            paddingLeft: "12px",
            paddingRight: "12px",
            paddingTop: "8px",
            resize: "vertical",
            scrollbarColor: "auto",
            scrollbarWidth: "auto",
            tabSize: 4,
            textAlign: "start",
            visibility: "visible",
            width: "100%",
            maxWidth: 550,
          }}
          rows={3}
        />
      </p>
    </form>
  );
};
