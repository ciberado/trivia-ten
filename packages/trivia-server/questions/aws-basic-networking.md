# AWS basic networking

## Question 1

You are setting up a Virtual Private Cloud (VPC) in AWS. What is the primary purpose of a VPC?

### Correct answers

* To create a logically isolated network for your AWS resources.

### Incorrect answers

* To automatically scale your applications.
* To manage user access to AWS services.
* To monitor network traffic in real-time.

### Metadata

* Difficulty: medium

## Question 2

You are configuring an Internet Gateway for your VPC. What is its primary role?

### Correct answers

* To allow communication between instances in your VPC and the internet.

### Incorrect answers

* To manage private IP addresses within a subnet.
* To provide VPN access to on-premises networks.
* To monitor incoming and outgoing traffic.

### Metadata

* Difficulty: medium

## Question 3

You need to enable instances in a private subnet to access the internet without exposing them directly. Which service should you implement?

### Correct answers

* NAT Gateway for outbound internet access.

### Incorrect answers

* Internet Gateway for direct access.
* VPC Peering for cross-account access.
* Route 53 for DNS resolution.

### Metadata

* Difficulty: medium

## Question 4

Your application requires communication between instances in different subnets. What type of IP address should you use?

### Correct answers

* Private IP addresses for internal communication.

### Incorrect answers

* Public IP addresses for external communication.
* Elastic IP addresses for fixed assignments.
* NAT addresses for secure connections.

### Metadata

* Difficulty: medium

## Question 5

You have a web application hosted in a public subnet and an API server in a private subnet. What is the best way to ensure that the API server can communicate with the web application securely?

### Correct answers

* Use private IP addresses for communication between the two subnets.

### Incorrect answers

* Use public IP addresses for direct internet access.
* Implement a NAT Gateway for API server access.
* Utilize Elastic IPs to maintain static connections.

### Metadata

* Difficulty: medium

## Question 6

You are tasked with ensuring that your EC2 instances can only be accessed from two specific IP addresses. Which AWS feature will you recommend to achieve this?

### Correct answers

* Security Groups to define inbound and outbound rules.

### Incorrect answers

* Network ACLs for broader control over subnets.
* Route tables for directing traffic.
* NAT Gateways for private subnet access.

### Metadata

* Difficulty: medium

## Question 7

You are managing a VPC with multiple subnets across different availability zones. How can you ensure high availability for your application? What approach should you take?

### Correct answers

* Deploy instances across multiple subnets in different availability zones.

### Incorrect answers

* Use a single subnet in one availability zone for all instances.
* Assign all instances public IP addresses for direct access.
* Implement a NAT Gateway in only one subnet for redundancy.

### Metadata

* Difficulty: medium

## Question 8

Your team is deploying a new microservices architecture in AWS. How can you efficiently manage IP address allocation and avoid conflicts?

### Correct answers

* Define a well-structured CIDR block for your VPC and allocate subnets accordingly.

### Incorrect answers

* Allow AWS to automatically assign IP addresses without planning.
* Use public IPs exclusively for all services regardless of their needs.
* Manually assign IP addresses to each instance without a defined strategy.

### Metadata

* Difficulty: medium

## Question 9

A company is setting up a VPC with both public and private subnets. Which of the following route table configurations would allow instances in a private subnet to access the internet while maintaining security?

### Correct answers

* Configure the private subnet's route table with a route to a NAT gateway in a public subnet

### Incorrect answers

* Add a route to the Internet Gateway directly in the private subnet's route table
* Configure the private subnet's route table with a route to a NAT instance in the same private subnet
* Leave the private subnet's route table with only the local route to the VPC CIDR block

### Metadata

* Difficulty: medium

## Question 10

An e-commerce company wants to improve the resilience of their application deployed across multiple Availability Zones. Which route table strategy should they implement for their private subnets?

### Correct answers

* Create separate route tables for private subnets in each AZ, each pointing to a NAT gateway in its respective AZ

### Incorrect answers

* Use a single route table for all private subnets across all AZs
* Create separate route tables for each private subnet, all pointing to a single NAT gateway
* Use the main route table for all private subnets without any modifications

### Metadata

* Difficulty: hard