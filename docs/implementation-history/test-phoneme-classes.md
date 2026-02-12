# Phoneme Classes Manual Testing

## Test 1: Simple Class Expansion
**Rules:**
```
[a b] > c;
```

**Forward Test:**
- Input: `abc`
- Expected: `ccc` (both a and b become c)

**Backward Test:**
- Input: `c`
- Expected: `a`, `b` (c could have been either a or b)

## Test 2: Paired Class Mapping
**Rules:**
```
[a b] > [x y];
```

**Forward Test:**
- Input: `ab`
- Expected: `xy` (a→x, b→y)

**Backward Test:**
- Input: `xy`
- Expected: `ab` (only one possibility)

## Test 3: Class with Context
**Rules:**
```
a > b / [c d] _;
```

**Forward Test:**
- Input: `ca`
- Expected: `cb` (a becomes b after c)
- Input: `da`
- Expected: `db` (a becomes b after d)
- Input: `ea`
- Expected: `ea` (a stays a after e)

**Backward Test:**
- Input: `cb`
- Expected: `ca` (b was a after c)

## Test 4: Complex Example with Multi-char Phonemes
**Rules:**
```
[th sh] > [θ ʃ];
```

**Forward Test:**
- Input: `think sharp`
- Expected: `θink ʃarp`

**Backward Test:**
- Input: `θink ʃarp`
- Expected: `think sharp`

## Test 5: Class Merger (Many Possibilities)
**Rules:**
```
[a b c] > x;
```

**Forward Test:**
- Input: `abc`
- Expected: `xxx`

**Backward Test:**
- Input: `xx`
- Expected: 9 results (`aa`, `ab`, `ac`, `ba`, `bb`, `bc`, `ca`, `cb`, `cc`)

## Test 6: Multiple Classes in One Rule
**Rules:**
```
[a b] > [x y] / [c d] _;
```

This expands to 4 rules:
1. `a > x / c _;`
2. `a > x / d _;`
3. `b > y / c _;`
4. `b > y / d _;`

**Forward Test:**
- Input: `ca`
- Expected: `cx` (a becomes x after c)
- Input: `db`
- Expected: `dy` (b becomes y after d)
