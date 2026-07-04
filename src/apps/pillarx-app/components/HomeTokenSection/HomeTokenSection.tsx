// types
import { ApiResponse } from '../../../../types/api';

// utils
import { componentMap } from '../../utils/configComponent';

// components
import AnimatedTile from '../AnimatedTile/AnimatedTitle';
import SkeletonTiles from '../SkeletonTile/SkeletonTile';
import Body from '../Typography/Body';

// images
import RefreshIcon from '../../images/refresh-button.png';

type HomeTokenSectionProps = {
  title: string;
  data?: ApiResponse;
  isDataLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  skeletonType: 'horizontal' | 'vertical';
  accountAddress?: string;
  onRefresh: () => void;
};

const HomeTokenSection = ({
  title,
  data,
  isDataLoading,
  isRefreshing,
  isError,
  skeletonType,
  accountAddress,
  onRefresh,
}: HomeTokenSectionProps) => {
  const projections = data?.projection || [];

  if (!isDataLoading && !isError && !projections.length) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Body className="text-purple_light">{title}</Body>
        <button
          type="button"
          aria-label={`Refresh ${title}`}
          disabled={isRefreshing}
          className={`flex w-fit h-fit items-center justify-center rounded-[10px] border-x-2 border-t-2 border-b-4 border-[#121116] ${isRefreshing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          onClick={() => {
            onRefresh();
          }}
        >
          <img
            src={RefreshIcon}
            alt="refresh-button"
            className={`w-9 h-[34px] ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {isDataLoading && <SkeletonTiles type={skeletonType} />}

      {!isDataLoading &&
        projections.map((projection, index) => {
          const TileComponent = componentMap[projection.layout];

          if (!TileComponent) {
            return null;
          }

          return (
            <AnimatedTile
              key={`${projection.id}-${index}`}
              isDataLoading={false}
              data={projection}
              accountAddress={accountAddress}
            >
              <TileComponent data={projection} isDataLoading={false} />
            </AnimatedTile>
          );
        })}

      {isError && !projections.length && !isDataLoading && (
        <Body className="text-center text-white/50">
          Unable to load {title.toLowerCase()}.
        </Body>
      )}
    </section>
  );
};

export default HomeTokenSection;
