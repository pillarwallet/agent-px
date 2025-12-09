const PnLStatsSkeleton = () => (
  <div className="relative w-auto h-[92px] bg-[#121116] mx-2.5 mt-1 mb-2.5 rounded-[10px] border-t border-b border-[#121116]">
    <div className="flex flex-row justify-between items-center h-full px-3 py-[10px] animate-pulse">
      {/* Column 1 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-12 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-14 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 2 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-12 bg-white/10 rounded" />
          <div className="h-3 w-14 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 3 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-10 bg-white/10 rounded" />
          <div className="h-3 w-8 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-8 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 4 */}
      <div className="flex flex-col h-[72px] justify-between items-end">
        <div className="flex flex-col gap-2 items-end">
          <div className="h-2 w-20 bg-white/10 rounded" />
          <div className="h-3 w-24 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  </div>
);

export default PnLStatsSkeleton;
