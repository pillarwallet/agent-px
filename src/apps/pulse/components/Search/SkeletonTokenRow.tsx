const SkeletonTokenRow = () => (
  <div className="flex w-full rounded-[10px] h-[60px] py-3 px-6 animate-pulse">
    <div className="flex items-center flex-[2.2] min-w-0">
      <div className="w-8 h-8 rounded-full bg-white/10" />
      <div className="flex flex-col ml-3 min-w-0 gap-2">
        <div className="h-3 w-20 bg-white/10 rounded" />
        <div className="h-2 w-16 bg-white/10 rounded" />
      </div>
    </div>
    <div className="flex flex-col flex-1 items-end justify-center gap-2">
      <div className="h-3 w-16 bg-white/10 rounded" />
      <div className="h-2 w-12 bg-white/10 rounded" />
    </div>
    <div className="flex flex-col flex-[1.6] items-end justify-center gap-2">
      <div className="h-3 w-14 bg-white/10 rounded" />
      <div className="h-2 w-10 bg-white/10 rounded" />
    </div>
  </div>
);

export default SkeletonTokenRow;
