import { useNavigate } from 'react-router-dom';
import TileContainer from '../TileContainer/TileContainer';

const PerpsTile = () => {
  const navigate = useNavigate();

  const handleNavigateToPerps = () => {
    navigate('/perps');
  };

  return (
    <TileContainer id="perps-tile">
      <button type="button" onClick={handleNavigateToPerps} className="w-full">
        <div className="flex flex-col rounded-2xl bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 desktop:min-h-[320px] tablet:min-h-[280px] mobile:min-h-[240px] justify-end p-10 mobile:p-4 hover:opacity-90 transition-opacity cursor-pointer">
          <div className="flex flex-col gap-4">
            <p className="text-[45px] font-medium tablet:leading-[67.5px] desktop:leading-[67.5px] mobile:text-xl mobile:leading-[30px] text-white text-left">
              Perps are here with Hyperliquid
            </p>
            <p className="font-medium desktop:text-[22px] tablet:text-[22px] tablet:leading-[33px] desktop:leading-[33px] mobile:text-sm text-white/90 text-left">
              Start trading with short and long positions up to 50x with
              Hyperliquid
            </p>
            <div className="mt-6 mobile:mt-2">
              <span className="font-medium bg-white/20 backdrop-blur-sm rounded-md py-3 px-5 mobile:text-sm mobile:py-2 mobile:px-4 text-white inline-block">
                Start Trading →
              </span>
            </div>
          </div>
        </div>
      </button>
    </TileContainer>
  );
};

export default PerpsTile;
