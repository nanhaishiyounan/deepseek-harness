## UI Pro Max Search Results
**Domain:** ux | **Query:** animation accessibility touch loading forms navigation
**Source:** ux-guidelines.csv | **Found:** 15 results

### Result 1
- **Category:** Animation
- **Issue:** Loading States
- **Platform:** All
- **Description:** Show feedback during async operations
- **Do:** Use skeleton screens or spinners
- **Don't:** Leave UI frozen with no feedback
- **Code Example Good:** animate-pulse skeleton
- **Code Example Bad:** Blank screen while loading
- **Severity:** High

### Result 2
- **Category:** Animation
- **Issue:** Hover vs Tap
- **Platform:** All
- **Description:** Hover effects don't work on touch devices
- **Do:** Use click/tap for primary interactions
- **Don't:** Rely only on hover for important actions
- **Code Example Good:** onClick handler
- **Code Example Bad:** onMouseEnter only
- **Severity:** High

### Result 3
- **Category:** Accessibility
- **Issue:** Keyboard Navigation
- **Platform:** Web
- **Description:** All functionality accessible via keyboard
- **Do:** Tab order matches visual order
- **Don't:** Keyboard traps or illogical tab order
- **Code Example Good:** tabIndex for custom order
- **Code Example Bad:** Unreachable elements
- **Severity:** High

### Result 4
- **Category:** Accessibility
- **Issue:** Skip Links
- **Platform:** Web
- **Description:** Allow keyboard users to skip navigation
- **Do:** Provide skip to main content link
- **Don't:** No skip link on nav-heavy pages
- **Code Example Good:** Skip to main content link
- **Code Example Bad:** 100 tabs to reach content
- **Severity:** Medium

### Result 5
- **Category:** Accessibility
- **Issue:** Heading Hierarchy
- **Platform:** Web
- **Description:** Screen readers use headings for navigation
- **Do:** Use sequential heading levels h1-h6
- **Don't:** Skip heading levels or misuse for styling
- **Code Example Good:** h1 then h2 then h3
- **Code Example Bad:** h1 then h4
- **Severity:** Medium

### Result 6
- **Category:** Touch
- **Issue:** Touch Spacing
- **Platform:** Mobile
- **Description:** Adjacent touch targets need adequate spacing
- **Do:** Minimum 8px gap between touch targets
- **Don't:** Tightly packed clickable elements
- **Code Example Good:** gap-2 between buttons
- **Code Example Bad:** gap-0 or gap-1
- **Severity:** Medium

### Result 7
- **Category:** Animation
- **Issue:** Continuous Animation
- **Platform:** All
- **Description:** Infinite animations are distracting
- **Do:** Use for loading indicators only
- **Don't:** Use for decorative elements
- **Code Example Good:** animate-spin on loader
- **Code Example Bad:** animate-bounce on icons
- **Severity:** Medium

### Result 8
- **Category:** Responsive
- **Issue:** Touch Friendly
- **Platform:** Web
- **Description:** Mobile layouts need touch-sized targets
- **Do:** Increase touch targets on mobile
- **Don't:** Same tiny buttons on mobile
- **Code Example Good:** Larger buttons on mobile
- **Code Example Bad:** Desktop-sized targets on mobile
- **Severity:** High

### Result 9
- **Category:** Touch
- **Issue:** Touch Target Size
- **Platform:** Mobile
- **Description:** Small buttons are hard to tap accurately
- **Do:** Minimum 44x44px touch targets
- **Don't:** Tiny clickable areas
- **Code Example Good:** min-h-[44px] min-w-[44px]
- **Code Example Bad:** w-6 h-6 buttons
- **Severity:** High

### Result 10
- **Category:** Navigation
- **Issue:** Sticky Navigation
- **Platform:** Web
- **Description:** Fixed nav should not obscure content
- **Do:** Add padding-top to body equal to nav height
- **Don't:** Let nav overlap first section content
- **Code Example Good:** pt-20 (if nav is h-20)
- **Code Example Bad:** No padding compensation
- **Severity:** Medium

### Result 11
- **Category:** Performance
- **Issue:** Lazy Loading
- **Platform:** All
- **Description:** Load content as needed
- **Do:** Lazy load below-fold images and content
- **Don't:** Load everything upfront
- **Code Example Good:** loading='lazy'
- **Code Example Bad:** All images eager load
- **Severity:** Medium

### Result 12
- **Category:** Touch
- **Issue:** Pull to Refresh
- **Platform:** Mobile
- **Description:** Accidental refresh is frustrating
- **Do:** Disable where not needed
- **Don't:** Enable by default everywhere
- **Code Example Good:** overscroll-behavior: contain
- **Code Example Bad:** Default overscroll
- **Severity:** Low

### Result 13
- **Category:** Performance
- **Issue:** Font Loading
- **Platform:** Web
- **Description:** Web fonts can block rendering
- **Do:** Use font-display swap or optional
- **Don't:** Invisible text during font load
- **Code Example Good:** font-display: swap
- **Code Example Bad:** FOIT (Flash of Invisible Text)
- **Severity:** Medium

### Result 14
- **Category:** Feedback
- **Issue:** Loading Indicators
- **Platform:** All
- **Description:** Show system status during waits
- **Do:** Show spinner/skeleton for operations > 300ms
- **Don't:** No feedback during loading
- **Code Example Good:** Skeleton or spinner
- **Code Example Bad:** Frozen UI
- **Severity:** High

### Result 15
- **Category:** Interaction
- **Issue:** Loading Buttons
- **Platform:** All
- **Description:** Prevent double submission during async actions
- **Do:** Disable button and show loading state
- **Don't:** Allow multiple clicks during processing
- **Code Example Good:** disabled={loading} spinner
- **Code Example Bad:** Button clickable while loading
- **Severity:** High
