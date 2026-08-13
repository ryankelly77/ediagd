import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Doggett's monthly group workbook is 2.78 MB, and Server Actions cap
       * request bodies at 1 MB by default — so the upload failed before the
       * parser ever saw it. 16 MB leaves room for the file to roughly quintuple
       * as more rooftops join without this becoming a surprise on a Monday.
       *
       * The cap exists to stop a large body being parsed on the server, so
       * raising it is only defensible because the one action that accepts a
       * body this size is platform-owner gated and re-checks that server-side.
       */
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
