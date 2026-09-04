
type HermesLogoProps = {
  className?: string;
};

// Nous Research Hermes official brand artwork for the light product surface.
const HermesLogo = ({ className = 'w-5 h-5' }: HermesLogoProps) => {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/hermes.png`}
      alt="Hermes"
      className={className}
    />
  );
};

export default HermesLogo;
