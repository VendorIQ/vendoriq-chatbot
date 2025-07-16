// supabase/functions/send-report/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { email, score, feedback } = await req.json();

    console.log("📩 Preparing to send report for:", email);

    // Simulate sending email or log report (replace this with your email logic)
    const reportText = `
      VendorIQ Assessment Report

      Supplier: ${email}
      Score: ${score}
      Feedback:
      ${feedback.map((line: string) => `- ${line}`).join("\n")}
    `;

    console.log(reportText); // Replace this with actual email API call

    return new Response(JSON.stringify({ status: "success", message: "Report logged." }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("❌ Error in send-report:", err);
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
