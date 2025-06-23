## Constructor Parameters

The contract expects these parameters in order:

- force_majeure: false - Force majeure disabled at contract level

- penalty_duration: 86400 - 24 hours (1 day) in seconds
- penalty_percentage: 10 - 10% penalty per period
- cap_percentage: 55 - 55% maximum penalty cap
- termination: 1209600 - 14 days (2 weeks) in seconds
- fractional_part: "day" - Round fractional days up to full days - could be "hour" or "minute"

### Test 1: Basic Penalty Calculation (1 Second Late)

Force Majeure: ☐ (unchecked)
Agreed Delivery: 1703980800
Delivered At: 1703980801
Goods Value: 1000000

### Test 2: On-Time Delivery (No Penalty)

Force Majeure: ☐ (unchecked)
Agreed Delivery: 1703980800
Delivered At: 1703980800
Goods Value: 1000000



