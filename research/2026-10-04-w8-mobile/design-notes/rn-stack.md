## UI Pro Max Stack Guidelines
**Stack:** react-native | **Query:** list performance navigation
**Source:** stacks/react-native.csv | **Found:** 10 results

### Result 1
- **Category:** Navigation
- **Guideline:** Type navigation params
- **Description:** Type-safe navigation
- **Do:** Typed navigation props
- **Don't:** Untyped navigation
- **Code Good:** navigation.navigate<RootStackParamList>('Home', { id })
- **Code Bad:** navigation.navigate('Home', { id })
- **Severity:** Medium
- **Docs URL:**

### Result 2
- **Category:** Navigation
- **Guideline:** Use React Navigation
- **Description:** Standard navigation library
- **Do:** React Navigation for routing
- **Don't:** Manual navigation management
- **Code Good:** createStackNavigator()
- **Code Bad:** Custom navigation state
- **Severity:** Medium
- **Docs URL:** https://reactnavigation.org/

### Result 3
- **Category:** Lists
- **Guideline:** Optimize renderItem
- **Description:** Memoize list item components
- **Do:** React.memo for list items
- **Don't:** Inline render function
- **Code Good:** renderItem={({ item }) => <MemoizedItem item={item} />}
- **Code Bad:** renderItem={({ item }) => <View>...</View>}
- **Severity:** High
- **Docs URL:**

### Result 4
- **Category:** Navigation
- **Guideline:** Use deep linking
- **Description:** Support URL-based navigation
- **Do:** Configure linking prop
- **Don't:** No deep link support
- **Code Good:** linking: { prefixes: [] }
- **Code Bad:** No linking configuration
- **Severity:** Medium
- **Docs URL:** https://reactnavigation.org/docs/deep-linking/

### Result 5
- **Category:** Lists
- **Guideline:** Provide keyExtractor
- **Description:** Unique keys for list items
- **Do:** keyExtractor with stable ID
- **Don't:** Index as key
- **Code Good:** keyExtractor={(item) => item.id}
- **Code Bad:** keyExtractor={(_, index) => index}
- **Severity:** High
- **Docs URL:**

### Result 6
- **Category:** Lists
- **Guideline:** Use FlatList for long lists
- **Description:** Virtualized list rendering
- **Do:** FlatList for 50+ items
- **Don't:** ScrollView with map
- **Code Good:** <FlatList data={items} />
- **Code Bad:** <ScrollView>{items.map()}</ScrollView>
- **Severity:** High
- **Docs URL:** https://reactnative.dev/docs/flatlist

### Result 7
- **Category:** Navigation
- **Guideline:** Handle back button
- **Description:** Android back button handling
- **Do:** useFocusEffect with BackHandler
- **Don't:** Ignore back button
- **Code Good:** BackHandler.addEventListener
- **Code Bad:** No back handler
- **Severity:** High
- **Docs URL:**

### Result 8
- **Category:** Performance
- **Guideline:** Use React.memo
- **Description:** Prevent unnecessary re-renders
- **Do:** memo for pure components
- **Don't:** No memoization
- **Code Good:** export default memo(MyComponent)
- **Code Bad:** export default MyComponent
- **Severity:** Medium
- **Docs URL:**

### Result 9
- **Category:** Performance
- **Guideline:** Avoid anonymous functions in JSX
- **Description:** Prevent re-renders
- **Do:** Named handlers or useCallback
- **Don't:** Inline arrow functions
- **Code Good:** onPress={handlePress}
- **Code Bad:** onPress={() => doSomething()}
- **Severity:** Medium
- **Docs URL:**

### Result 10
- **Category:** Animation
- **Guideline:** Use Reanimated
- **Description:** High-performance animations
- **Do:** react-native-reanimated
- **Don't:** Animated API for complex
- **Code Good:** useSharedValue useAnimatedStyle
- **Code Bad:** Animated.timing for gesture
- **Severity:** Medium
- **Docs URL:** https://docs.swmansion.com/react-native-reanimated/
