import React from "react";

// Tiny footer showing the build version. Baked in by scripts/gen-version.js at
// build time; for `npm start` (local dev) it's undefined and we show "dev".
export default function VersionFooter() {
  const version = process.env.REACT_APP_BUILD_VERSION || "dev";
  return (
    <div className="version-footer" title="Build version">
      v{version}
    </div>
  );
}
