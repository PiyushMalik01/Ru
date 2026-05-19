import { BetaBanner } from "@/components/landing/beta-banner";
import { PosterNav } from "@/components/landing/nav/poster-nav";
import { Hero } from "@/components/landing/hero";
import { Story } from "@/components/landing/story";
import { Comparison } from "@/components/landing/comparison";
import { Demo } from "@/components/landing/demo";
import { Scenarios } from "@/components/landing/scenarios";
import { Features } from "@/components/landing/features";
import { Trust } from "@/components/landing/trust";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div style={{ background: "#f4ecf2" }}>
      <BetaBanner />
      <PosterNav />
      <Hero />
      <Story />
      <Comparison />
      <Demo />
      <Scenarios />
      <Features />
      <Trust />
      <FinalCta />
      <Footer />
    </div>
  );
}
