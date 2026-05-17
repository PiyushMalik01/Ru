import { Hero } from "@/components/landing/hero";
import { Story } from "@/components/landing/story";
import { Demo } from "@/components/landing/demo";
import { Features } from "@/components/landing/features";
import { Trust } from "@/components/landing/trust";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Story />
      <Demo />
      <Features />
      <Trust />
      <FinalCta />
      <Footer />
    </>
  );
}
