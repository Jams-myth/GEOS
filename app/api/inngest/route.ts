import { serve } from "inngest/next";
import type { InngestFunction } from "inngest";
import { inngest } from "../../../inngest/client";

// Functions will be registered here in Task 2
const functions: InngestFunction.Like[] = [];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
