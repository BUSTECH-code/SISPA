"use client";

import React, { useState } from "react";
import { usePWAInstall } from "./usePWAInstall";
import { Download, Share2, PlusSquare, X } from "lucide-react";

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    if (compact) {
      return (
        <button
          onClick={install}
          title="Install SISPA on your phone"
          className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Install App</span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 hover:bg-amber-700 active:scale-98 transition-all"
      >
        <Download className="h-4 w-4" />
        <span>Install SISPA to Home Screen</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-bold hover:bg-amber-100 transition-all ${
            compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-2 text-xs"
          }`}
        >
          <Download className="h-3.5 w-3.5 text-amber-700" />
          <span>Install on iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Install SISPA on iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-slate-900">Step 1:</strong> Tap the <strong>Share</strong> button at the bottom of Safari.
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                    <PlusSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-slate-900">Step 2:</strong> Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-2xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 active:scale-98 transition-all"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
