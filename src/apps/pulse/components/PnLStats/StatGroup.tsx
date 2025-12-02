interface StatGroupProps {
  topLabel: string;
  topValue: string;
  bottomLabel: string;
  bottomValue: string;
  align?: 'left' | 'right';
  valueColor?: string;
  topValueColor?: string;
}

const StatGroup = ({
  topLabel,
  topValue,
  bottomLabel,
  bottomValue,
  align = 'left',
  valueColor = 'white',
  topValueColor = 'white',
}: StatGroupProps) => (
  <div
    className={`flex flex-col h-[72px] justify-between ${align === 'right' ? 'items-end' : 'items-start'}`}
  >
    <div
      className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <span className="text-[10px] text-white opacity-30 font-poppins leading-[10px] mb-[6px]">
        {topLabel}
      </span>
      <span
        className="text-[12px] font-poppins leading-[12px]"
        style={{ color: topValueColor }}
      >
        {topValue}
      </span>
    </div>
    <div
      className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <span className="text-[10px] text-white opacity-30 font-poppins leading-[10px] mb-[6px]">
        {bottomLabel}
      </span>
      <span
        className="text-[12px] font-poppins leading-[12px]"
        style={{ color: valueColor }}
      >
        {bottomValue}
      </span>
    </div>
  </div>
);

export default StatGroup;
