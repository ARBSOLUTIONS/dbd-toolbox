import { createContext, useContext } from 'react';

// Lets any component jump to another tab, e.g. "show best combos for this perk".
export const NavContext = createContext({ showCombos: null });
export const useNav = () => useContext(NavContext);
