export const isPosBowlItem = (item) => item?.category === "bowls";

export const isValidDoubleProteinRewardBowl = (bowl) => Boolean(
  bowl
  && bowl.bowlSize === "large"
  && Array.isArray(bowl.proteins)
  && bowl.proteins.length === 3
  && Array.isArray(bowl.extraScoopProteins)
  && bowl.extraScoopProteins.length === 1
  && bowl.proteins.includes(bowl.extraScoopProteins[0])
);

