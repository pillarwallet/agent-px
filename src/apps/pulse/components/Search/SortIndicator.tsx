interface SortIndicatorProps {
  active: boolean;
  direction: 'asc' | 'desc';
}

const SortIndicator = ({ active, direction }: SortIndicatorProps) => (
  <div className="flex flex-col w-2 h-[14px] justify-center gap-[2px]">
    {/* Up Arrow - Polygon 50 */}
    <svg
      width="8"
      height="6"
      viewBox="0 0 8 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="transition-opacity"
      style={{ opacity: active && direction === 'asc' ? 1 : 0.3 }}
    >
      <path d="M4 0L7.4641 6H0.535898L4 0Z" fill="white" />
    </svg>
    {/* Down Arrow - Polygon 51 */}
    <svg
      width="8"
      height="6"
      viewBox="0 0 8 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="transition-opacity"
      style={{ opacity: active && direction === 'desc' ? 1 : 0.3 }}
    >
      <path d="M4 6L0.535898 0L7.4641 0L4 6Z" fill="white" />
    </svg>
  </div>
);

export default SortIndicator;
