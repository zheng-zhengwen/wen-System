type awenLogoProps = {
  className?: string;
};

// awenAgent —— 自托管智能体，用品牌 logo（绿色 Y+叶子，白底方形，明暗通用）。
const awenLogo = ({ className = 'w-5 h-5' }: awenLogoProps) => {
  return (
    <img
      src={`${import.meta.env.BASE_URL}awen-logo.png`}
      alt="awenAgent"
      className={className}
    />
  );
};

export default awenLogo;
