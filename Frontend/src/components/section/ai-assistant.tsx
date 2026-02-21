'use client';
import { motion } from 'framer-motion';
import Image from 'next/image';

export function AiAssistant() {
  return (
    <section className="bg-black text-[24px] text-white pt-61.25 pb-53.5 max-lg:py-30 px-4">
      <div className="flex max-w-283.75 mx-auto gap-5 max-lg:flex-col max-lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:max-w-78.75 sm:max-w-[80%] flex flex-col justify-between py-7 gap-10"
        >
          <p>
            Learn crypto the smart way with guided lessons, quizzes, and real
            explanations powered by AI — from beginner basics to advanced
            trading concepts.
          </p>
          <p>
            Join a social crypto community to share ideas, discuss trends, and
            connect with traders, builders, and educators in real time.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center max-lg:px-4 py-6"
        >
          <Image
            src="/ai.svg"
            alt="ai"
            width={466}
            height={508}
            className="object-contain"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:max-w-78.75 sm:max-w-[80%] flex flex-col justify-between py-7 gap-10"
        >
          <p>
            Chat or speak with Stellara AI to understand markets, strategies,
            and Stellar tools — available 24/7 to guide your learning journey.
          </p>
          <p>
            Connect your wallet, explore Stellar assets, track your portfolio,
            and move from learning to real on-chain trading seamlessly.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
