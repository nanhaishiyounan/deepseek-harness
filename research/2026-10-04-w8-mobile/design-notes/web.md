## UI Pro Max Search Results
**Domain:** web | **Query:** touch targets safe areas dynamic type
**Source:** app-interface.csv | **Found:** 8 results

### Result 1
- **Category:** Safe Areas
- **Issue:** Safe Area Insets
- **Platform:** iOS/Android/React Native
- **Description:** Content must not overlap notches/gesture bars
- **Do:** Wrap screens in SafeAreaView or apply insets
- **Don't:** Place tappable content under system bars
- **Code Example Good:** <SafeAreaView style={{ flex: 1 }}><Screen /></SafeAreaView>
- **Code Example Bad:** <View style={{ flex: 1 }}><Screen /></View>
- **Severity:** High

### Result 2
- **Category:** Touch
- **Issue:** Touch Target Size
- **Platform:** iOS/Android/React Native
- **Description:** Primary touch targets must be at least 44x44pt
- **Do:** Increase hitSlop or padding to meet minimum
- **Don't:** Small icons with tiny touch area
- **Code Example Good:** <Pressable hitSlop={10}><Icon /></Pressable>
- **Code Example Bad:** <Pressable><Icon style={{ width: 16, height: 16 }} /></Pressable>
- **Severity:** Critical

### Result 3
- **Category:** Touch
- **Issue:** Touch Spacing
- **Platform:** iOS/Android/React Native
- **Description:** Adjacent touch targets need enough spacing
- **Do:** Keep at least 8dp spacing between touchables
- **Don't:** Cluster many buttons with no gap
- **Code Example Good:** <View style={{ gap: 8 }}><Button ... /><Button ... /></View>
- **Code Example Bad:** <View><Button ... /><Button ... /></View>
- **Severity:** Medium

### Result 4
- **Category:** Typography
- **Issue:** Base Font Size
- **Platform:** iOS/Android/React Native
- **Description:** Body text must be readable and support Dynamic Type
- **Do:** Use platform fontScale and at least 14–16pt base
- **Don't:** Render critical text below 12pt
- **Code Example Good:** <Text style={{ fontSize: 16 }}>Body</Text>
- **Code Example Bad:** <Text style={{ fontSize: 10 }}>Body</Text>
- **Severity:** High

### Result 5
- **Category:** Typography
- **Issue:** Dynamic Type Support
- **Platform:** iOS/Android/React Native
- **Description:** Support system text scaling without breaking layout
- **Do:** Set allowFontScaling and test large text
- **Don't:** Disable scaling on all text globally
- **Code Example Good:** <Text allowFontScaling>{label}</Text>
- **Code Example Bad:** <Text allowFontScaling={false}>{label}</Text>
- **Severity:** High

### Result 6
- **Category:** Forms
- **Issue:** Keyboard Type
- **Platform:** iOS/Android/React Native
- **Description:** Use appropriate keyboardType and returnKeyType
- **Do:** Match email/tel/number/search types
- **Don't:** Use default keyboard for all inputs
- **Code Example Good:** <TextInput keyboardType="email-address" />
- **Code Example Bad:** <TextInput keyboardType="default" />
- **Severity:** Medium

### Result 7
- **Category:** Accessibility
- **Issue:** Dynamic Updates
- **Platform:** iOS/Android/React Native
- **Description:** Async status updates should be announced to screen readers
- **Do:** Use accessibilityLiveRegion or announceForAccessibility
- **Don't:** Update text silently with no announcement
- **Code Example Good:** <Text accessibilityLiveRegion="polite">{status}</Text>
- **Code Example Bad:** <Text>{status}</Text>
- **Severity:** Medium

### Result 8
- **Category:** Touch
- **Issue:** Gesture Conflicts
- **Platform:** iOS/Android/React Native
- **Description:** Custom gestures must not break system scroll/back
- **Do:** Reserve horizontal swipes for carousels
- **Don't:** Full-screen custom swipe conflicting with back
- **Code Example Good:** HorizontalPager inside vertical ScrollView
- **Code Example Bad:** PanResponder on full screen blocking back
- **Severity:** High
