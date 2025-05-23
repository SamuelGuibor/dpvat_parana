/* eslint-disable no-unused-vars */
/* @typescript-eslint/no-unused-vars */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../_lib/utils";
import { CiPause1 } from "react-icons/ci";
import { MdOutlineNotStarted } from "react-icons/md";

interface Feature {
  step: string;
  title?: string;
  content: string;
  image: string; // Kept for compatibility, but not used in this version
}

interface FeatureStepsProps {
  features: Feature[];
  className?: string;
  title?: string;
  autoPlayInterval?: number;
  imageHeight?: string;
  videoSrc?: string; // Prop for video source
}

export function FeatureSteps({
  features,
  className,
  title = "",
  autoPlayInterval = 3000,
  videoSrc = "/video.mp4", // Default video source
}: FeatureStepsProps) {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // Track play/pause state
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null); // Reference to video element
  const [isVisible, setIsVisible] = useState(false);

  // Handle IntersectionObserver to detect visibility and control autoplay
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting && videoRef.current) {
          // Attempt to play the video
          videoRef.current.play().then(() => {
            setIsPlaying(true);
          })
        } else if (videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  // Handle feature text cycling
  useEffect(() => {
    const timer = setInterval(() => {
      if (progress < 100) {
        setProgress((prev) => prev + 100 / (autoPlayInterval / 100));
      } else {
        setCurrentFeature((prev) => (prev + 1) % features.length);
        setProgress(0);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [progress, features.length, autoPlayInterval]);
useEffect(() => {
  if (videoRef.current) {
    videoRef.current.addEventListener('canplay', () => {
      if (isVisible && !isPlaying) {
        videoRef.current?.play().then(() => setIsPlaying(true))
      }
    });
  }
}, [isVisible, isPlaying]);
  // Toggle play/pause
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        })
      }
    }
  };

  return (
    <div ref={sectionRef} className={cn("p-8 md:p-12", className)}>
      <div className="max-w-7xl mx-auto w-full overflow-hidden">
        <motion.h2
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold mb-10 text-center text-white"
        >
          {title}
        </motion.h2>

        <div className="flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-10">
          <motion.div
            className="order-2 md:order-1 space-y-8 lg:space-y-24"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: isVisible ? 0 : -100, opacity: isVisible ? 1 : 0 }}
            transition={{ duration: 0.8 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="flex items-center gap-6 md:gap-8"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: index === currentFeature ? 1 : 0.3 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  className={cn(
                    "w-8 h-8 md:w-10 md:h-10 relative left-4 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    index === currentFeature
                      ? "bg-blue-600 border-blue-600 text-white scale-110 shadow-xl"
                      : "bg-gray-200 border-gray-300 text-gray-600"
                  )}
                >
                  {index <= currentFeature ? (
                    <span className="text-lg font-bold">✓</span>
                  ) : (
                    <span className="text-lg font-semibold">{index + 1}</span>
                  )}
                </motion.div>

                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-semibold text-white">
                    {feature.title || feature.step}
                  </h3>
                  <p className="text-sm md:text-lg text-gray-400">
                    {feature.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div
            className={cn(
              "order-1 md:order-2 relative h-[300px] md:h-[550px] lg:h-[600px] overflow-hidden rounded-lg"
            )}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              loop
              className="w-full h-full object-cover"
            />
            <button
              onClick={togglePlayPause}
              className="absolute top-4 left-4 bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 transition-colors"
            >
              {isPlaying ? <CiPause1 size={28} /> : <MdOutlineNotStarted size={28} />}
            </button>
            <div className="absolute bottom-0 left-0 right-0 h-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}